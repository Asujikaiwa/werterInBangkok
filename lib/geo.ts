import type { Feature, FeatureCollection, MultiPolygon, Polygon, Position } from "geojson";
import type { DistrictProps } from "./types";

export type DistrictFeature = Feature<Polygon | MultiPolygon, DistrictProps>;
export type DistrictCollection = FeatureCollection<Polygon | MultiPolygon, DistrictProps>;

function inRing(lon: number, lat: number, ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inPolygon(lon: number, lat: number, rings: Position[][]): boolean {
  if (!rings.length || !inRing(lon, lat, rings[0])) return false;
  for (let k = 1; k < rings.length; k++) if (inRing(lon, lat, rings[k])) return false;
  return true;
}

export function pointInFeature(lon: number, lat: number, f: DistrictFeature): boolean {
  const g = f.geometry;
  if (g.type === "Polygon") return inPolygon(lon, lat, g.coordinates);
  return g.coordinates.some((p) => inPolygon(lon, lat, p));
}

/** ระยะทางโดยประมาณ (กม.) */
export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function findDistrict(lon: number, lat: number, fc: DistrictCollection): string | null {
  for (const f of fc.features) if (pointInFeature(lon, lat, f)) return f.properties.id;
  return null;
}
