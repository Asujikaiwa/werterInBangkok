import { NextResponse } from "next/server";
import geo from "@/lib/data/districts.json";
import { buildResponse, type RawInputs } from "@/lib/aggregate";
import type { DistrictCollection } from "@/lib/geo";
import { FLOOD_API_URL, OPEN_METEO_URL, THAIWATER_URL, fetchRain, fetchRivers, fetchStations } from "@/lib/sources";
import type { SourceStatus } from "@/lib/types";
import { demoInputs } from "@/lib/demo";

const fc = geo as unknown as DistrictCollection;

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function GET(request: Request) {
  if (new URL(request.url).searchParams.get("demo") === "1") {
    const sources: SourceStatus[] = [
      { key: "openmeteo", name: "ข้อมูลจำลอง (demo) — ไม่ใช่ข้อมูลจริง", url: "", ok: true },
    ];
    return NextResponse.json(buildResponse(fc, demoInputs(fc), sources));
  }

  const points = fc.features.map((f) => ({ lat: f.properties.lat, lon: f.properties.lon }));

  const [rain, rivers, stations] = await Promise.allSettled([fetchRain(points), fetchRivers(), fetchStations()]);

  const raw: RawInputs = {
    rain: rain.status === "fulfilled" ? rain.value : null,
    rivers: rivers.status === "fulfilled" ? rivers.value : null,
    stations: stations.status === "fulfilled" ? stations.value : null,
  };

  const sources: SourceStatus[] = [
    {
      key: "openmeteo",
      name: "Open-Meteo — ฝนจริง + พยากรณ์",
      url: OPEN_METEO_URL,
      ok: rain.status === "fulfilled",
      count: raw.rain?.length,
      error: rain.status === "rejected" ? errMsg(rain.reason) : undefined,
    },
    {
      key: "glofas",
      name: "GloFAS (Open-Meteo Flood) — น้ำท่าแม่น้ำ",
      url: FLOOD_API_URL,
      ok: rivers.status === "fulfilled",
      count: raw.rivers?.length,
      error: rivers.status === "rejected" ? errMsg(rivers.reason) : undefined,
    },
    {
      key: "thaiwater",
      name: "ThaiWater (สสน.) — ระดับน้ำสถานี",
      url: THAIWATER_URL,
      ok: stations.status === "fulfilled",
      count: raw.stations?.length,
      error: stations.status === "rejected" ? errMsg(stations.reason) : undefined,
    },
  ];

  const body = buildResponse(fc, raw, sources);
  return NextResponse.json(body, {
    headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=600" },
  });
}
