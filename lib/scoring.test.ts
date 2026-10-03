import { test } from "node:test";
import assert from "node:assert/strict";
import { levelFromScore, scoreDistrict } from "./scoring.ts";

const dry = { r24: 0, r72: 0, f24: 0 };

test("ไม่มีฝน ไม่มีน้ำ = ปกติ", () => {
  const r = scoreDistrict({ rain: dry, water: null, riverRatio: null, base: 0.8 });
  assert.equal(r.score, 0);
  assert.equal(r.level, 0);
});

test("ฝนหนักมาก 120 มม. + พยากรณ์ 50 มม. ในพื้นที่ต่ำ = เสี่ยงท่วมหนัก", () => {
  const r = scoreDistrict({ rain: { r24: 120, r72: 160, f24: 50 }, water: null, riverRatio: null, base: 0.8 });
  assert.equal(r.level, 3);
});

test("พื้นที่เปราะบางต่ำได้คะแนนน้อยกว่าพื้นที่ต่ำที่ฝนเท่ากัน", () => {
  const rain = { r24: 60, r72: 80, f24: 20 };
  const lo = scoreDistrict({ rain, water: null, riverRatio: null, base: 0.35 });
  const hi = scoreDistrict({ rain, water: null, riverRatio: null, base: 0.8 });
  assert.ok(hi.score > lo.score);
});

test("สถานีล้นตลิ่ง บังคับอย่างน้อย เสี่ยงท่วม แม้ฝนไม่ตก", () => {
  const r = scoreDistrict({ rain: dry, water: { maxSituation: 5, maxStoragePct: 105 }, riverRatio: null, base: 0.55 });
  assert.ok(r.level >= 2);
});

test("ปัจจัยที่ไม่มีข้อมูลไม่ถูกนับเป็นศูนย์", () => {
  const rain = { r24: 90, r72: 180, f24: 90 };
  const r = scoreDistrict({ rain, water: null, riverRatio: null, base: 0.55 });
  assert.equal(r.parts.water, null);
  assert.ok(r.score >= 85);
});

test("เกณฑ์ระดับ", () => {
  assert.deepEqual([0, 14, 15, 34, 35, 54, 55, 100].map(levelFromScore), [0, 0, 1, 1, 2, 2, 3, 3]);
});
