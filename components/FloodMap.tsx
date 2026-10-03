"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import { CircleMarker, GeoJSON, MapContainer, Popup, TileLayer, Tooltip, useMap } from "react-leaflet";
import { LEVELS } from "@/lib/scoring";
import type { DistrictCollection, DistrictFeature } from "@/lib/geo";
import type { DistrictData, Station } from "@/lib/types";

interface Props {
  geo: DistrictCollection;
  byId: Map<string, DistrictData>;
  stations: Station[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  visibleIds: Set<string>;
}

const SITUATION: Record<number, { th: string; color: string }> = {
  1: { th: "น้อยวิกฤต", color: "#b5651d" },
  2: { th: "น้ำน้อย", color: "#e3a857" },
  3: { th: "ปกติ", color: "#2f9e5b" },
  4: { th: "น้ำมาก", color: "#1f6fd1" },
  5: { th: "ล้นตลิ่ง", color: "#d42a3c" },
};

function FlyTo({ geo, selectedId }: { geo: DistrictCollection; selectedId: string | null }) {
  const map = useMap();
  useEffect(() => {
    if (!selectedId) return;
    const f = geo.features.find((x) => x.properties.id === selectedId);
    if (!f) return;
    const b = L.geoJSON(f).getBounds();
    map.flyToBounds(b, { padding: [40, 40], maxZoom: 12, duration: 0.6 });
  }, [selectedId, geo, map]);
  return null;
}

export default function FloodMap({ geo, byId, stations, selectedId, onSelect, visibleIds }: Props) {
  const layerRef = useRef<L.GeoJSON | null>(null);
  const bounds = useMemo(() => L.geoJSON(geo).getBounds(), [geo]);

  const styleFor = useMemo(
    () => (f?: DistrictFeature) => {
      if (!f) return {};
      const d = byId.get(f.properties.id);
      const lvl = d?.hasData ? LEVELS[d.level] : null;
      const visible = visibleIds.has(f.properties.id);
      const selected = f.properties.id === selectedId;
      return {
        color: selected ? "#111" : "#ffffff",
        weight: selected ? 3 : 1,
        fillColor: lvl?.color ?? "#9aa4b1",
        fillOpacity: visible ? (selected ? 0.75 : 0.55) : 0.08,
        opacity: visible ? 1 : 0.3,
      };
    },
    [byId, selectedId, visibleIds],
  );

  const styleRef = useRef(styleFor);
  styleRef.current = styleFor;

  // อัปเดตสีโดยไม่สร้าง layer ใหม่
  useEffect(() => {
    layerRef.current?.setStyle((f) => styleFor(f as DistrictFeature));
  }, [styleFor]);

  useEffect(() => {
    if (!selectedId || !layerRef.current) return;
    layerRef.current.eachLayer((l) => {
      const f = (l as L.Polygon).feature as DistrictFeature | undefined;
      if (f?.properties.id === selectedId) (l as L.Polygon).bringToFront();
    });
  }, [selectedId]);

  return (
    <MapContainer bounds={bounds} boundsOptions={{ padding: [10, 10] }} minZoom={8} className="map">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
      />
      <GeoJSON
        ref={layerRef}
        data={geo}
        style={(f) => styleRef.current(f as DistrictFeature)}
        onEachFeature={(f, layer) => {
          const p = (f as DistrictFeature).properties;
          layer.on({
            click: () => onSelect(p.id),
            mouseover: (e) => (e.target as L.Path).setStyle({ weight: 2.5, color: "#333" }),
            mouseout: (e) => (e.target as L.Path).setStyle(styleRef.current(f as DistrictFeature)),
          });
          layer.bindTooltip(() => {
            const d = byIdRef.current.get(p.id);
            const lvl = d?.hasData ? LEVELS[d.level] : null;
            return `<b>${p.name_th}</b> · ${p.prov_th}<br/>${lvl ? `${lvl.th} (${d!.score})` : "ไม่มีข้อมูล"}`;
          }, { sticky: true });
        }}
      />
      {stations.map((s) => {
        const sit = s.situation != null ? SITUATION[s.situation] : undefined;
        return (
          <CircleMarker
            key={s.id}
            center={[s.lat, s.lon]}
            radius={s.situation != null && s.situation >= 4 ? 7 : 5}
            pathOptions={{ color: "#fff", weight: 1.5, fillColor: sit?.color ?? "#667", fillOpacity: 0.95 }}
          >
            <Tooltip>{s.name}</Tooltip>
            <Popup>
              <div className="pop">
                <b>{s.name}</b>
                <div>สถานการณ์: <span style={{ color: sit?.color }}>{sit?.th ?? "–"}</span></div>
                {s.levelMsl != null && <div>ระดับน้ำ: {s.levelMsl.toFixed(2)} ม.รทก.</div>}
                {s.storagePct != null && <div>ความจุลำน้ำ: {s.storagePct.toFixed(0)}%</div>}
                {s.bankText && s.bankDiff != null && (
                  <div>{s.bankText.replace(" (ม.)", "")}: {Math.abs(s.bankDiff).toFixed(2)} ม.</div>
                )}
                {s.time && <div className="muted">เวลา {s.time}</div>}
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
      <FlyTo geo={geo} selectedId={selectedId} />
      <ByIdSync byId={byId} />
    </MapContainer>
  );
}

// tooltip อ่านค่าล่าสุดผ่าน ref (onEachFeature ถูกเรียกครั้งเดียว)
const byIdRef: { current: Map<string, DistrictData> } = { current: new Map() };
function ByIdSync({ byId }: { byId: Map<string, DistrictData> }) {
  byIdRef.current = byId;
  return null;
}

export { SITUATION };
