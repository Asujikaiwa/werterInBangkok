import type { RainInput, ScoreResult, WaterInput } from "./scoring";

export type SourceKey = "openmeteo" | "glofas" | "thaiwater";

export interface SourceStatus {
  key: SourceKey;
  name: string;
  url: string;
  ok: boolean;
  count?: number;
  error?: string;
}

export interface Station {
  id: string;
  name: string;
  lat: number;
  lon: number;
  districtId: string | null;
  situation: number | null;
  levelMsl: number | null;
  storagePct: number | null;
  bankText: string | null;
  bankDiff: number | null;
  time: string | null;
}

export interface DistrictData extends ScoreResult {
  id: string;
  rain: RainInput | null;
  water: WaterInput | null;
  riverRatio: number | null;
  stationIds: string[];
}

export interface FloodResponse {
  updatedAt: string;
  sources: SourceStatus[];
  districts: DistrictData[];
  stations: Station[];
  rivers: { key: string; name: string; ratio: number | null; maxNext3: number | null; mean60: number | null }[];
}

export interface DistrictProps {
  id: string;
  name_th: string;
  name_en: string;
  prov_th: string;
  prov_en: string;
  base: number;
  river: "chao" | "thachin" | null;
  lat: number;
  lon: number;
  area: number;
}
