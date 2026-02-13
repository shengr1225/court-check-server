import { NextResponse } from "next/server";
import { mustGetEnv } from "@/lib/env";
import type { Court } from "@/lib/schemas";
import { CheckinService } from "@/services/CheckinService";
import { CourtService } from "@/services/CourtService";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

function parseCoordinate(value: string | null): number | undefined {
  if (value === null) return undefined;
  const num = Number(value);
  if (!Number.isFinite(num)) return undefined;
  return num;
}

function toChunkedDestinations(courts: Court[], size: number): Court[][] {
  const chunks: Court[][] = [];
  for (let i = 0; i < courts.length; i += size) {
    chunks.push(courts.slice(i, i + size));
  }
  return chunks;
}

function metersToMiles(distanceMeters: number): number {
  return distanceMeters / 1609.344;
}

async function getDistanceByCourtId(params: {
  originLat: number;
  originLong: number;
  courts: Court[];
}): Promise<Map<string, number>> {
  const googleApiKey = mustGetEnv("GOOGLE_API_KEY");
  const distanceMilesByCourtId = new Map<string, number>();
  const courtsWithCoordinates = params.courts.filter(
    (court) => typeof court.lat === "number" && typeof court.long === "number"
  );

  const destinationChunks = toChunkedDestinations(courtsWithCoordinates, 25);
  for (const chunk of destinationChunks) {
    const url = new URL(
      "https://maps.googleapis.com/maps/api/distancematrix/json"
    );
    url.searchParams.set("origins", `${params.originLat},${params.originLong}`);
    url.searchParams.set(
      "destinations",
      chunk.map((court) => `${court.lat},${court.long}`).join("|")
    );
    url.searchParams.set("key", googleApiKey);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `Google Distance Matrix request failed: ${response.status}`
      );
    }
    const payload = await response.json();
    if (payload.status !== "OK") {
      throw new Error(`Google Distance Matrix returned ${payload.status}`);
    }

    const elements = payload.rows?.[0]?.elements;
    if (!Array.isArray(elements) || elements.length !== chunk.length) {
      throw new Error("Google Distance Matrix response shape mismatch");
    }

    chunk.forEach((court, index) => {
      const element = elements[index];
      const distanceMeters = element?.distance?.value;
      if (element?.status === "OK" && typeof distanceMeters === "number") {
        distanceMilesByCourtId.set(court.id, metersToMiles(distanceMeters));
      }
    });
  }

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
    distanceMilesByCourtId = await getDistanceByCourtId({
      originLat,
      originLong,
      courts,
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
