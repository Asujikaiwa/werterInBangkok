import type { RawInputs } from "./aggregate";
import type { DistrictCollection } from "./geo";

/**
 * ข้อมูลจำลอง (?demo=1) — ใช้ทดสอบ UI เมื่อเครือข่ายเข้าถึง API ไม่ได้
 * สร้างพายุฝนสมมติศูนย์กลางฝั่งตะวันออกของ กทม. ไม่ใช่ข้อมูลจริง
 */
export function demoInputs(fc: DistrictCollection): RawInputs {
  const center = { lat: 13.8, lon: 100.72 };
  const rain = fc.features.map((f) => {
    const d = Math.hypot(f.properties.lat - center.lat, (f.properties.lon - center.lon) * 0.97) * 111;
    const k = Math.exp(-(d * d) / (2 * 18 * 18));
    return {
      r24: Math.round(110 * k * 10) / 10,
      r72: Math.round(160 * k * 10) / 10,
      f24: Math.round(45 * k * 10) / 10,
    };
  });
  return {
    rain,
    rivers: [
      { key: "chao", name: "แม่น้ำเจ้าพระยา (นนทบุรี)", ratio: 1.6, maxNext3: 2400, mean60: 1500 },
      { key: "thachin", name: "แม่น้ำท่าจีน (นครชัยศรี)", ratio: 1.1, maxNext3: 330, mean60: 300 },
    ],
    stations: [
      { id: "d1", name: "คลองแสนแสบ (มีนบุรี)", lat: 13.808, lon: 100.73, situation: 5, levelMsl: 1.32, storagePct: 104, bankText: "ล้นตลิ่ง (ม.)", bankDiff: 0.06, time: null },
      { id: "d2", name: "คลองประเวศบุรีรมย์", lat: 13.722, lon: 100.75, situation: 4, levelMsl: 0.95, storagePct: 88, bankText: "ต่ำกว่าตลิ่ง (ม.)", bankDiff: -0.15, time: null },
      { id: "d3", name: "แม่น้ำเจ้าพระยา (สะพานพระราม 7)", lat: 13.808, lon: 100.519, situation: 3, levelMsl: 1.1, storagePct: 62, bankText: "ต่ำกว่าตลิ่ง (ม.)", bankDiff: -1.2, time: null },
      { id: "d4", name: "คลองบางเขน", lat: 13.86, lon: 100.6, situation: 3, levelMsl: 0.6, storagePct: 55, bankText: "ต่ำกว่าตลิ่ง (ม.)", bankDiff: -0.8, time: null },
    ],
  };
}
