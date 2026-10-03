import { distanceKm, findDistrict, type DistrictCollection } from "./geo";
import { scoreDistrict, type RainInput, type WaterInput } from "./scoring";
import type { DistrictData, FloodResponse, SourceStatus, Station } from "./types";

const NEAREST_STATION_KM = 5;

export interface RawInputs {
  rain: RainInput[] | null; // เรียงตามลำดับ features
  rivers: FloodResponse["rivers"] | null;
  stations: Omit<Station, "districtId">[] | null;
}

export function buildResponse(fc: DistrictCollection, raw: RawInputs, sources: SourceStatus[]): FloodResponse {
  const stations: Station[] = (raw.stations ?? []).map((s) => ({ ...s, districtId: findDistrict(s.lon, s.lat, fc) }));

  const riverRatio = new Map<string, number | null>();
  for (const r of raw.rivers ?? []) riverRatio.set(r.key, r.ratio);

  const districts: DistrictData[] = fc.features.map((f, i) => {
    const p = f.properties;
    let linked = stations.filter((s) => s.districtId === p.id);
    if (!linked.length && stations.length) {
      // ไม่มีสถานีในเขต → ใช้สถานีที่ใกล้ที่สุดในระยะ 5 กม.
      let best: Station | null = null;
      let bestD = Infinity;
      for (const s of stations) {
        const d = distanceKm(p.lat, p.lon, s.lat, s.lon);
        if (d < bestD) {
          bestD = d;
          best = s;
        }
      }
      if (best && bestD <= NEAREST_STATION_KM) linked = [best];
    }

    let water: WaterInput | null = null;
    if (linked.length) {
      const sits = linked.map((s) => s.situation).filter((v): v is number => v != null);
      const pcts = linked.map((s) => s.storagePct).filter((v): v is number => v != null);
      water = {
        maxSituation: sits.length ? Math.max(...sits) : null,
        maxStoragePct: pcts.length ? Math.max(...pcts) : null,
      };
    }

    const rain = raw.rain?.[i] ?? null;
    const rr = p.river ? riverRatio.get(p.river) ?? null : null;
    const res = scoreDistrict({ rain, water, riverRatio: rr, base: p.base });

    return { id: p.id, rain, water, riverRatio: rr, stationIds: linked.map((s) => s.id), ...res };
  });

  return {
    updatedAt: new Date().toISOString(),
    sources,
    districts,
    stations,
    rivers: raw.rivers ?? [],
  };
}
