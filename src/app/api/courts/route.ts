import { NextResponse } from "next/server";
import { mustGetEnv } from "@/lib/env";
import type { Court } from "@/lib/schemas";
import { CheckinService } from "@/services/CheckinService";
import { CourtService } from "@/services/CourtService";

const DISTANCE_TOP_K = 50;

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

function parseCoordinate(value: string | null): number | undefined {
  if (value === null) return undefined;
  const num = Number(value);
  if (!Number.isFinite(num)) return undefined;
  return num;
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function getHaversineDistanceMiles(params: {
  originLat: number;
  originLong: number;
  destinationLat: number;
  destinationLong: number;
}): number {
  const earthRadiusMiles = 3958.8;
  const dLat = toRadians(params.destinationLat - params.originLat);
  const dLong = toRadians(params.destinationLong - params.originLong);
  const originLatRad = toRadians(params.originLat);
  const destinationLatRad = toRadians(params.destinationLat);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(originLatRad) *
      Math.cos(destinationLatRad) *
      Math.sin(dLong / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusMiles * c;
}

function selectTopKByAirDistance(params: {
  originLat: number;
  originLong: number;
  courts: Court[];
  topK: number;
}): Court[] {
  return params.courts
    .filter(
      (court): court is Court & { lat: number; long: number } =>
        typeof court.lat === "number" && typeof court.long === "number"
    )
    .map((court) => ({
      court,
      distanceMiles: getHaversineDistanceMiles({
        originLat: params.originLat,
        originLong: params.originLong,
        destinationLat: court.lat,
        destinationLong: court.long,
      }),
    }))
    .sort((a, b) => a.distanceMiles - b.distanceMiles)
    .slice(0, params.topK)
    .map((item) => item.court);
}

async function getDistanceByCourtId(params: {
  originLat: number;
  originLong: number;
  courts: Court[];
}): Promise<Map<string, number>> {
  const distanceMilesByCourtId = new Map<string, number>();
  params.courts
    .filter(
      (court): court is Court & { lat: number; long: number } =>
        typeof court.lat === "number" && typeof court.long === "number"
    )
    .forEach((court) => {
      const distanceMiles = getHaversineDistanceMiles({
        originLat: params.originLat,
        originLong: params.originLong,
        destinationLat: court.lat,
        destinationLong: court.long,
      });
      distanceMilesByCourtId.set(court.id, distanceMiles);
    });

  return distanceMilesByCourtId;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const latRaw = url.searchParams.get("lat");
  const longRaw = url.searchParams.get("long");
  if ((latRaw && !longRaw) || (!latRaw && longRaw)) {
    return json(400, {
      ok: false,
      error: "Both lat and long query params are required together",
    });
  }

  const originLat = parseCoordinate(latRaw);
  const originLong = parseCoordinate(longRaw);
  if (
    (latRaw !== null && originLat === undefined) ||
    (longRaw !== null && originLong === undefined)
  ) {
    return json(400, { ok: false, error: "Invalid lat/long query params" });
  }
  if (
    originLat !== undefined &&
    (originLat < -90 ||
      originLat > 90 ||
      originLong === undefined ||
      originLong < -180 ||
      originLong > 180)
  ) {
    return json(400, { ok: false, error: "lat/long out of range" });
  }

  const tableName = mustGetEnv("DYNAMODB_TABLE");
  const courts = await CourtService.listCourts({ tableName });
  let sortedCourts = courts;
  let distanceMilesByCourtId = new Map<string, number>();

  if (originLat !== undefined && originLong !== undefined) {
    const topCourts = selectTopKByAirDistance({
      originLat,
      originLong,
      courts,
      topK: DISTANCE_TOP_K,
    });
    distanceMilesByCourtId = await getDistanceByCourtId({
      originLat,
      originLong,
      courts: topCourts,
    });
    sortedCourts = [...courts].sort((a, b) => {
      const aDistance =
        distanceMilesByCourtId.get(a.id) ?? Number.POSITIVE_INFINITY;
      const bDistance =
        distanceMilesByCourtId.get(b.id) ?? Number.POSITIVE_INFINITY;
      return aDistance - bDistance;
    });
  }

  const checkinsByCourt = await Promise.all(
    sortedCourts.map((court) =>
      CheckinService.listCheckinsByCourtId({ tableName, courtId: court.id })
    )
  );
  const courtsWithCheckins = sortedCourts.map((court, i) => {
    const distanceMiles = distanceMilesByCourtId.get(court.id);
    return {
      ...court,
      ...(distanceMiles !== undefined ? { distanceMiles } : {}),
      checkins: checkinsByCourt[i],
    };
  });
  return json(200, { ok: true, courts: courtsWithCheckins });
}
