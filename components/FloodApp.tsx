"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LEVELS, THRESHOLDS, scoreDistrict, withExtraRain, type LevelIndex } from "@/lib/scoring";
import type { DistrictCollection } from "@/lib/geo";
import type { DistrictData, DistrictProps, FloodResponse } from "@/lib/types";

const FloodMap = dynamic(() => import("./FloodMap"), {
  ssr: false,
  loading: () => <div className="map map-loading">กำลังโหลดแผนที่…</div>,
});

const PROVINCES = ["ทั้งหมด", "กรุงเทพมหานคร", "นนทบุรี", "ปทุมธานี", "สมุทรปราการ", "สมุทรสาคร", "นครปฐม"];
const BASE_TEXT = (b: number) => (b >= 0.8 ? "สูง (พื้นที่ต่ำ/ท่วมซ้ำซาก)" : b <= 0.35 ? "ต่ำ (มีแนวป้องกัน/ระบายดี)" : "ปานกลาง");
const fmt = (n: number | null | undefined, d = 1) => (n == null ? "–" : n.toFixed(d));

export default function FloodApp() {
  const [geo, setGeo] = useState<DistrictCollection | null>(null);
  const [data, setData] = useState<FloodResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [province, setProvince] = useState("ทั้งหมด");
  const [extraRain, setExtraRain] = useState(0);
  const [levelFilter, setLevelFilter] = useState<LevelIndex | null>(null);
  const [demo, setDemo] = useState(false);

  useEffect(() => {
    setDemo(new URLSearchParams(window.location.search).get("demo") === "1");
    fetch("/data/districts.geojson")
      .then((r) => r.json())
      .then(setGeo)
      .catch(() => setError("โหลดขอบเขตเขต/อำเภอไม่สำเร็จ"));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams(window.location.search).get("demo") === "1" ? "?demo=1" : "";
      const r = await fetch(`/api/flood${q}`, { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setData(await r.json());
    } catch (e) {
      setError(`ดึงข้อมูลไม่สำเร็จ: ${e instanceof Error ? e.message : e}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30 * 60 * 1000);
    return () => clearInterval(t);
  }, [load]);

  const props = useMemo(() => {
    const m = new Map<string, DistrictProps>();
    geo?.features.forEach((f) => m.set(f.properties.id, f.properties));
    return m;
  }, [geo]);

  // คำนวณใหม่ฝั่ง client เมื่อใช้โหมดจำลองฝน
  const districts = useMemo<DistrictData[]>(() => {
    if (!data) return [];
    if (!extraRain) return data.districts;
    return data.districts.map((d) => {
      const base = props.get(d.id)?.base ?? 0.55;
      const res = scoreDistrict({ rain: withExtraRain(d.rain, extraRain), water: d.water, riverRatio: d.riverRatio, base });
      return { ...d, ...res, rain: withExtraRain(d.rain, extraRain) };
    });
  }, [data, extraRain, props]);

  const byId = useMemo(() => new Map(districts.map((d) => [d.id, d])), [districts]);

  const inProvince = useCallback(
    (id: string) => province === "ทั้งหมด" || props.get(id)?.prov_th === province,
    [province, props],
  );

  const visibleIds = useMemo(
    () =>
      new Set(
        districts
          .filter((d) => inProvince(d.id) && (levelFilter == null || (d.hasData && d.level === levelFilter)))
          .map((d) => d.id),
      ),
    [districts, inProvince, levelFilter],
  );

  const counts = useMemo(() => {
    const c = [0, 0, 0, 0];
    districts.forEach((d) => d.hasData && inProvince(d.id) && c[d.level]++);
    return c;
  }, [districts, inProvince]);

  const ranked = useMemo(
    () => districts.filter((d) => visibleIds.has(d.id)).sort((a, b) => b.score - a.score),
    [districts, visibleIds],
  );

  const noData = !!data && !districts.some((d) => d.hasData);
  const NODATA = "#9aa4b1";
  const colorOf = (d: DistrictData) => (d.hasData ? LEVELS[d.level].color : NODATA);

  const sel = selectedId ? byId.get(selectedId) : undefined;
  const selP = selectedId ? props.get(selectedId) : undefined;
  const selStations = sel && data ? data.stations.filter((s) => sel.stationIds.includes(s.id)) : [];

  return (
    <div className="app">
      <header className="top">
        <div>
          <h1>
            <svg className="drop" viewBox="0 0 24 24" aria-hidden><path d="M12 2.5C8 8 5 11.6 5 15a7 7 0 0 0 14 0c0-3.4-3-7-7-12.5z" fill="currentColor"/></svg> WaterInBangkok
          </h1>
          <p className="sub">แผนที่ประเมินความเสี่ยงน้ำท่วม กรุงเทพฯ และปริมณฑล · 79 เขต/อำเภอ</p>
        </div>
        <div className="top-right">
          {data && (
            <span className="muted small">
              อัปเดต {new Date(data.updatedAt).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}
            </span>
          )}
          <button className="btn" onClick={load} disabled={loading}>
            {loading ? "กำลังโหลด…" : "รีเฟรช"}
          </button>
        </div>
      </header>

      {demo && <div className="banner warn">โหมดข้อมูลจำลอง (demo) — ตัวเลขทั้งหมดไม่ใช่สถานการณ์จริง</div>}
      {error && <div className="banner err">{error}</div>}
      {noData && !error && (
        <div className="banner err">ยังดึงข้อมูลจาก API ไม่ได้ (ดูสถานะแหล่งข้อมูลด้านล่าง) — แผนที่แสดงเป็นสีเทา ลองเปิด ?demo=1 เพื่อดูตัวอย่าง</div>
      )}

      <main className="layout">
        <section className="map-wrap">
          {geo ? (
            <FloodMap
              geo={geo}
              byId={byId}
              stations={data?.stations ?? []}
              selectedId={selectedId}
              onSelect={setSelectedId}
              visibleIds={visibleIds}
            />
          ) : (
            <div className="map map-loading">กำลังโหลดแผนที่…</div>
          )}
          <div className="legend">
            <b>ระดับความเสี่ยง</b>
            {LEVELS.map((l, i) => (
              <div key={l.key} className="legend-row">
                <span className="sw" style={{ background: l.color }} /> {l.th}
                <span className="muted small"> {THRESHOLDS[i]}{i < 3 ? `–${THRESHOLDS[i + 1] - 1}` : "+"}</span>
              </div>
            ))}
            <div className="legend-row small muted">● จุด = สถานีวัดระดับน้ำ</div>
          </div>
        </section>

        <aside className="side">
          <div className="cards">
            {LEVELS.map((l, i) => (
              <button
                key={l.key}
                className={`card ${levelFilter === i ? "active" : ""}`}
                style={{ borderColor: l.color }}
                onClick={() => setLevelFilter(levelFilter === i ? null : (i as LevelIndex))}
                title={l.desc}
              >
                <span className="card-n" style={{ color: l.color }}>{counts[i]}</span>
                <span className="card-l">{l.th}</span>
              </button>
            ))}
          </div>

          <div className="controls">
            <label>
              จังหวัด
              <select value={province} onChange={(e) => setProvince(e.target.value)}>
                {PROVINCES.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
            <label>
              จำลองฝนเพิ่ม 24 ชม. ข้างหน้า: <b>{extraRain} มม.</b>
              <input type="range" min={0} max={150} step={5} value={extraRain} onChange={(e) => setExtraRain(+e.target.value)} />
            </label>
          </div>

          {sel && selP && (
            <div className="detail" style={{ borderLeftColor: colorOf(sel) }}>
              <div className="detail-head">
                <div>
                  <h2>{selP.name_th}</h2>
                  <div className="muted small">{selP.prov_th} · {selP.name_en}</div>
                </div>
                <button className="x" onClick={() => setSelectedId(null)} aria-label="ปิด">×</button>
              </div>
              <div className="score-row">
                <span className="score" style={{ background: colorOf(sel) }}>{sel.hasData ? sel.score : "–"}</span>
                <div>
                  <b>{sel.hasData ? LEVELS[sel.level].th : "ไม่มีข้อมูล"}</b>
                  <div className="small muted">{sel.hasData ? LEVELS[sel.level].desc : "แหล่งข้อมูลยังไม่ตอบกลับ"}</div>
                </div>
              </div>
              <table className="kv">
                <tbody>
                  <tr><td>ฝน 24 ชม. ที่ผ่านมา</td><td>{fmt(sel.rain?.r24)} มม.</td></tr>
                  <tr><td>ฝน 72 ชม. ที่ผ่านมา</td><td>{fmt(sel.rain?.r72)} มม.</td></tr>
                  <tr><td>ฝนพยากรณ์ 24 ชม.</td><td>{fmt(sel.rain?.f24)} มม.</td></tr>
                  {sel.riverRatio != null && (
                    <tr><td>น้ำท่าแม่น้ำ (เทียบเฉลี่ย 60 วัน)</td><td>×{sel.riverRatio.toFixed(2)}</td></tr>
                  )}
                  <tr><td>ความเปราะบางพื้นที่</td><td>{BASE_TEXT(selP.base)}</td></tr>
                </tbody>
              </table>
              <div className="parts">
                {(["rain", "water", "river"] as const).map((k) => (
                  <div key={k} className="part">
                    <span>{k === "rain" ? "ฝน" : k === "water" ? "ระดับน้ำ" : "แม่น้ำ"}</span>
                    <div className="bar"><i style={{ width: `${(sel.parts[k] ?? 0) * 100}%` }} /></div>
                    <span className="small muted">{sel.parts[k] == null ? "ไม่มีข้อมูล" : `${Math.round(sel.parts[k]! * 100)}%`}</span>
                  </div>
                ))}
              </div>
              {selStations.length > 0 && (
                <div className="small">
                  <b>สถานีที่ใช้:</b>
                  <ul>
                    {selStations.map((s) => (
                      <li key={s.id}>
                        {s.name} — {s.storagePct != null ? `${s.storagePct.toFixed(0)}% ความจุ` : "–"}
                        {s.bankText && s.bankDiff != null ? `, ${s.bankText.replace(" (ม.)", "")} ${Math.abs(s.bankDiff).toFixed(2)} ม.` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="list-head">
            <b>เรียงตามความเสี่ยง</b>
            <span className="muted small">{ranked.length} พื้นที่</span>
          </div>
          <ol className="list">
            {ranked.map((d) => {
              const p = props.get(d.id);
              return (
                <li key={d.id}>
                  <button className={`row ${d.id === selectedId ? "on" : ""}`} onClick={() => setSelectedId(d.id)}>
                    <span className="dot" style={{ background: colorOf(d) }} />
                    <span className="row-name">
                      {p?.name_th ?? d.id}
                      <span className="muted small"> {p?.prov_th === "กรุงเทพมหานคร" ? "กทม." : p?.prov_th}</span>
                    </span>
                    <span className="row-rain small muted">{fmt(d.rain?.r24, 0)} มม.</span>
                    <span className="row-score">{d.hasData ? d.score : "–"}</span>
                  </button>
                </li>
              );
            })}
            {!ranked.length && !loading && <li className="muted small pad">ไม่มีพื้นที่ตามตัวกรอง</li>}
          </ol>

          <div className="sources">
            <b className="small">แหล่งข้อมูล</b>
            {data?.sources.map((s) => (
              <div key={s.key} className="src small">
                <span className={`st ${s.ok ? "ok" : "bad"}`} />
                {s.url ? <a href={s.url} target="_blank" rel="noreferrer">{s.name}</a> : s.name}
                {s.ok ? (s.count != null ? ` · ${s.count} รายการ` : "") : ` · ใช้งานไม่ได้ (${s.error})`}
              </div>
            ))}
            {data?.rivers.map((r) => (
              <div key={r.key} className="src small muted">
                {r.name}: {r.maxNext3 ?? "–"} ลบ.ม./วิ (เฉลี่ย 60 วัน {r.mean60 ?? "–"})
              </div>
            ))}
            <p className="disclaimer small muted">
              ดัชนีนี้คำนวณอัตโนมัติจากฝน ระดับน้ำ และน้ำท่า เพื่อการเฝ้าระวังเท่านั้น ไม่ใช่ประกาศทางการ
              โปรดติดตามประกาศจาก กทม. (โทร 1555) กรมอุตุนิยมวิทยา และ ปภ. (1784)
            </p>
          </div>
        </aside>
      </main>
    </div>
  );
}
