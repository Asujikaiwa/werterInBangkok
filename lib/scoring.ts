/**
 * ดัชนีความเสี่ยงน้ำท่วมรายเขต/อำเภอ (0–100) — ใช้ร่วมกันทั้งฝั่ง server และ client
 *
 * ปัจจัย (hazard):
 *   - ฝน      : ฝนสะสม 24 ชม. / 72 ชม. ที่ผ่านมา + ฝนพยากรณ์ 24 ชม. ข้างหน้า (Open-Meteo)
 *   - ระดับน้ำ : สถานการณ์สถานีโทรมาตรในพื้นที่ (ThaiWater / สสน.)
 *   - แม่น้ำ   : ปริมาณน้ำท่าพยากรณ์เทียบค่าเฉลี่ย 60 วัน (GloFAS ผ่าน Open-Meteo Flood API)
 *                ใช้เฉพาะเขตที่ติดแม่น้ำเจ้าพระยา / ท่าจีน
 * ตัวคูณความเปราะบาง (base): พื้นที่ต่ำ/จุดท่วมซ้ำซาก (ค่าประมาณคงที่ 0.35 / 0.55 / 0.8)
 *
 * ปัจจัยที่ไม่มีข้อมูล (null) จะถูกตัดออกแล้วถ่วงน้ำหนักใหม่ ไม่นับเป็น 0
 */

export type LevelIndex = 0 | 1 | 2 | 3;

export const LEVELS = [
  { key: "normal", th: "ปกติ", en: "Normal", color: "#2f9e5b", desc: "ยังไม่มีสัญญาณน้ำท่วม" },
  { key: "watch", th: "เฝ้าระวัง", en: "Watch", color: "#e0b000", desc: "ฝนตก/น้ำเริ่มสูง อาจมีน้ำรอระบาย" },
  { key: "moderate", th: "เสี่ยงท่วม", en: "Moderate", color: "#ee7a1f", desc: "มีโอกาสน้ำท่วมขังถนน/ชุมชนต่ำ" },
  { key: "severe", th: "เสี่ยงท่วมหนัก", en: "Severe", color: "#d42a3c", desc: "มีโอกาสท่วมสูงหรือน้ำล้นตลิ่ง" },
] as const;

/** เกณฑ์คะแนนขั้นต่ำของแต่ละระดับ */
export const THRESHOLDS = [0, 15, 35, 55] as const;

export const WEIGHTS = { rain: 0.55, water: 0.3, river: 0.15 } as const;

/** ฝน 24 ชม. ≥ 90 มม. = ฝนตกหนักมาก (เกณฑ์กรมอุตุนิยมวิทยา) */
export const RAIN_REF = { r24: 90, r72: 180, f24: 90 } as const;

export interface RainInput {
  r24: number; // มม. 24 ชม. ที่ผ่านมา
  r72: number; // มม. 72 ชม. ที่ผ่านมา
  f24: number; // มม. พยากรณ์ 24 ชม. ข้างหน้า
}

export interface WaterInput {
  /** situation_level สูงสุดของสถานีที่เกี่ยวข้อง (1 น้อยวิกฤต … 4 น้ำมาก, 5 ล้นตลิ่ง) */
  maxSituation: number | null;
  /** storage_percent สูงสุด (% ความจุลำน้ำ/ตลิ่ง) */
  maxStoragePct: number | null;
}

export interface ScoreInput {
  rain: RainInput | null;
  water: WaterInput | null;
  /** อัตราส่วนน้ำท่าสูงสุด 3 วันข้างหน้า / ค่าเฉลี่ย 60 วัน — null ถ้าไม่ติดแม่น้ำหรือไม่มีข้อมูล */
  riverRatio: number | null;
  base: number; // 0–1
}

export interface ScoreResult {
  score: number; // 0–100
  level: LevelIndex;
  /** false = ไม่มีข้อมูลจากแหล่งใดเลย (แสดงเป็นสีเทา ไม่ใช่ "ปกติ") */
  hasData: boolean;
  parts: { rain: number | null; water: number | null; river: number | null };
}

const clip = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));

export function rainHazard(r: RainInput): number {
  return clip(
    0.45 * clip(r.r24 / RAIN_REF.r24) +
      0.2 * clip(r.r72 / RAIN_REF.r72) +
      0.35 * clip(r.f24 / RAIN_REF.f24),
  );
}

export function waterHazard(w: WaterInput): number | null {
  if (w.maxSituation == null && w.maxStoragePct == null) return null;
  let h = 0;
  const s = w.maxSituation ?? 0;
  if (s >= 5) h = 1;
  else if (s >= 4) h = 0.6;
  const p = w.maxStoragePct;
  if (p != null) {
    if (p >= 100) h = Math.max(h, 1);
    else if (p >= 80) h = Math.max(h, 0.3 + ((p - 80) / 20) * 0.5);
  }
  return clip(h);
}

export function riverHazard(ratio: number): number {
  return clip((ratio - 1) / 1.5);
}

export function levelFromScore(score: number): LevelIndex {
  if (score >= THRESHOLDS[3]) return 3;
  if (score >= THRESHOLDS[2]) return 2;
  if (score >= THRESHOLDS[1]) return 1;
  return 0;
}

export function scoreDistrict(input: ScoreInput): ScoreResult {
  const parts = {
    rain: input.rain ? rainHazard(input.rain) : null,
    water: input.water ? waterHazard(input.water) : null,
    river: input.riverRatio != null && Number.isFinite(input.riverRatio) ? riverHazard(input.riverRatio) : null,
  };

  let wsum = 0;
  let hsum = 0;
  (Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]).forEach((k) => {
    const v = parts[k];
    if (v != null) {
      wsum += WEIGHTS[k];
      hsum += WEIGHTS[k] * v;
    }
  });
  const hazard = wsum > 0 ? hsum / wsum : 0;
  const vulnerability = 0.55 + 0.6 * clip(input.base);
  const score = Math.round(100 * clip(hazard * vulnerability));

  let level = levelFromScore(score);
  // น้ำล้นตลิ่งที่สถานีในพื้นที่ → อย่างน้อย "เสี่ยงท่วม"
  if (parts.water != null && parts.water >= 1 && level < 2) level = 2;

  return { score, level, hasData: wsum > 0, parts };
}

/** สำหรับโหมดจำลอง: เพิ่มฝน (มม.) ลงในพยากรณ์ 24 ชม. ข้างหน้า */
export function withExtraRain(rain: RainInput | null, extraMm: number): RainInput | null {
  if (!extraMm) return rain;
  const r = rain ?? { r24: 0, r72: 0, f24: 0 };
  return { ...r, f24: r.f24 + extraMm };
}
