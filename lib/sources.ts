import "server-only";
import type { RainInput } from "./scoring";
import type { Station } from "./types";

const TIMEOUT_MS = 15000;
const REVALIDATE_S = 1800; // แคช 30 นาที (Open-Meteo ฟรี 10,000 calls/วัน; 79 จุดต่อรอบ)

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { Accept: "application/json", "User-Agent": "WaterInBangkok/0.1" },
    next: { revalidate: REVALIDATE_S },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

const sum = (a: (number | null)[]) => a.reduce<number>((s, v) => s + (v ?? 0), 0);

/** "YYYY-MM-DDTHH:00" ตามเวลาไทย */
function bangkokHourKey(d = new Date()): string {
  return new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 13) + ":00";
}

/* ---------------- Open-Meteo: ฝนรายชั่วโมง (ย้อนหลัง 3 วัน + พยากรณ์ 2 วัน) ---------------- */

interface OMHourly {
  hourly?: { time: string[]; precipitation: (number | null)[] };
}

export const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";

export async function fetchRain(points: { lat: number; lon: number }[]): Promise<RainInput[]> {
  const out: RainInput[] = [];
  const now = bangkokHourKey();
  // แบ่งเป็นชุดละ 40 จุด กัน URL ยาวเกิน
  for (let i = 0; i < points.length; i += 40) {
    const chunk = points.slice(i, i + 40);
    const qs = new URLSearchParams({
      latitude: chunk.map((p) => p.lat.toFixed(4)).join(","),
      longitude: chunk.map((p) => p.lon.toFixed(4)).join(","),
      hourly: "precipitation",
      past_days: "3",
      forecast_days: "2",
      timezone: "Asia/Bangkok",
    });
    const data = await getJson<OMHourly | OMHourly[]>(`${OPEN_METEO_URL}?${qs}`);
    const arr = Array.isArray(data) ? data : [data];
    for (const d of arr) {
      const t = d.hourly?.time ?? [];
      const p = d.hourly?.precipitation ?? [];
      let idx = t.indexOf(now);
      if (idx < 0) idx = Math.min(t.length - 1, 72); // fallback: past_days=3 → index 72 ≈ ต้นวันนี้
      out.push({
        r24: round1(sum(p.slice(Math.max(0, idx - 23), idx + 1))),
        r72: round1(sum(p.slice(Math.max(0, idx - 71), idx + 1))),
        f24: round1(sum(p.slice(idx + 1, idx + 25))),
      });
    }
  }
  return out;
}

/* ---------------- Open-Meteo Flood API (GloFAS): น้ำท่าแม่น้ำ ---------------- */

export const RIVER_POINTS = [
  { key: "chao", name: "แม่น้ำเจ้าพระยา (นนทบุรี)", lat: 13.86, lon: 100.5 },
  { key: "thachin", name: "แม่น้ำท่าจีน (นครชัยศรี)", lat: 13.8, lon: 100.19 },
] as const;

export const FLOOD_API_URL = "https://flood-api.open-meteo.com/v1/flood";

interface OMFlood {
  daily?: { time: string[]; river_discharge: (number | null)[] };
}

export async function fetchRivers() {
  const qs = new URLSearchParams({
    latitude: RIVER_POINTS.map((r) => r.lat).join(","),
    longitude: RIVER_POINTS.map((r) => r.lon).join(","),
    daily: "river_discharge",
    past_days: "60",
    forecast_days: "7",
  });
  const data = await getJson<OMFlood | OMFlood[]>(`${FLOOD_API_URL}?${qs}`);
  const arr = Array.isArray(data) ? data : [data];
  const today = bangkokHourKey().slice(0, 10);
  return RIVER_POINTS.map((r, i) => {
    const t = arr[i]?.daily?.time ?? [];
    const q = arr[i]?.daily?.river_discharge ?? [];
    let idx = t.indexOf(today);
    if (idx < 0) idx = 60;
    const past = q.slice(Math.max(0, idx - 60), idx).filter((v): v is number => v != null);
    const next = q.slice(idx, idx + 3).filter((v): v is number => v != null);
    const mean60 = past.length ? past.reduce((a, b) => a + b, 0) / past.length : null;
    const maxNext3 = next.length ? Math.max(...next) : null;
    const ratio = mean60 && maxNext3 != null && mean60 > 0 ? maxNext3 / mean60 : null;
    return {
      key: r.key,
      name: r.name,
      ratio: ratio != null ? round2(ratio) : null,
      maxNext3: maxNext3 != null ? Math.round(maxNext3) : null,
      mean60: mean60 != null ? Math.round(mean60) : null,
    };
  });
}

/* ---------------- ThaiWater (สสน.): ระดับน้ำสถานีโทรมาตร ---------------- */

export const THAIWATER_URL = "https://api-v3.thaiwater.net/api/v1/thaiwater30/public/waterlevel_load";
export const PROVINCE_CODES = new Set(["10", "11", "12", "13", "73", "74"]);

interface TWRecord {
  id?: number | string;
  waterlevel_datetime?: string;
  waterlevel_msl?: string | number | null;
  storage_percent?: string | number | null;
  situation_level?: number | null;
  diff_wl_bank?: string | number | null;
  diff_wl_bank_text?: string | null;
  station?: {
    id?: number | string;
    tele_station_name?: { th?: string; en?: string };
    tele_station_lat?: number | string;
    tele_station_long?: number | string;
    province_code?: string;
  };
}

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
};

export async function fetchStations(): Promise<Omit<Station, "districtId">[]> {
  const data = await getJson<{ waterlevel_data?: { data?: TWRecord[] } }>(THAIWATER_URL);
  const rows = data.waterlevel_data?.data ?? [];
  const out: Omit<Station, "districtId">[] = [];
  for (const r of rows) {
    const s = r.station;
    if (!s || !PROVINCE_CODES.has(String(s.province_code ?? ""))) continue;
    const lat = num(s.tele_station_lat);
    const lon = num(s.tele_station_long);
    if (lat == null || lon == null) continue;
    const bankText = r.diff_wl_bank_text ?? null;
    let bankDiff = num(r.diff_wl_bank);
    // ข้อความ "ต่ำกว่าตลิ่ง" → ค่าเป็นลบ
    if (bankDiff != null && bankText && bankText.includes("ต่ำกว่า")) bankDiff = -Math.abs(bankDiff);
    out.push({
      id: String(s.id ?? r.id),
      name: s.tele_station_name?.th || s.tele_station_name?.en || "สถานีวัดระดับน้ำ",
      lat,
      lon,
      situation: num(r.situation_level),
      levelMsl: num(r.waterlevel_msl),
      storagePct: num(r.storage_percent),
      bankText,
      bankDiff,
      time: r.waterlevel_datetime ?? null,
    });
  }
  return out;
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}
function round2(n: number) {
  return Math.round(n * 100) / 100;
}
