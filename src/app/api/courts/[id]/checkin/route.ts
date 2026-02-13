import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authCookie, verifyAuthToken } from "@/lib/auth";
import { mustGetEnv } from "@/lib/env";
import { CourtStatusSchema } from "@/lib/schemas";
import { CheckinService } from "@/services/CheckinService";
import { CourtService } from "@/services/CourtService";
import { UserService } from "@/services/UserService";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

const BodySchema = z.object({
  status: CourtStatusSchema,
  photoUrl: z.string().url().optional(),
});

const CHECKIN_COOLDOWN_MS = 2 * 60 * 60 * 1000;
const CHECKIN_DISTANCE_LIMIT_MILES = 0.5;
const METERS_TO_MILES = 0.000621371;

function parseCoordinate(value: string | null): number | undefined {
  if (value === null) return undefined;
  const num = Number(value);
  if (!Number.isFinite(num)) return undefined;
  return num;
}

async function getGoogleDistanceMiles(params: {
  originLat: number;
  originLong: number;
  destinationLat: number;
  destinationLong: number;
}): Promise<number> {
  const googleApiKey = mustGetEnv("GOOGLE_API_KEY");
  const url = new URL(
    "https://maps.googleapis.com/maps/api/distancematrix/json"
  );
  url.searchParams.set("origins", `${params.originLat},${params.originLong}`);
  url.searchParams.set(
    "destinations",
    `${params.destinationLat},${params.destinationLong}`
  );
  url.searchParams.set("units", "imperial");
  url.searchParams.set("key", googleApiKey);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Google Distance Matrix request failed: ${response.status}`
    );
  }
  const data = (await response.json()) as {
    status?: string;
    rows?: Array<{
      elements?: Array<{
        status?: string;
        distance?: { value?: number };
      }>;
    }>;
  };
  if (data.status !== "OK") {
    throw new Error(
      `Google Distance Matrix status: ${data.status ?? "UNKNOWN"}`
    );
  }
  const element = data.rows?.[0]?.elements?.[0];
  if (element?.status !== "OK" || typeof element.distance?.value !== "number") {
    throw new Error(
      `Google Distance Matrix element status: ${element?.status ?? "UNKNOWN"}`
    );
  }
  return element.distance.value * METERS_TO_MILES;
}

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const url = new URL(request.url);
  const latRaw = url.searchParams.get("lat");
  const longRaw = url.searchParams.get("long");
  if (latRaw === null || longRaw === null) {
    return json(400, {
      ok: false,
      error: "lat and long query params are required",
    });
  }
  const originLat = parseCoordinate(latRaw);
  const originLong = parseCoordinate(longRaw);
  if (originLat === undefined || originLong === undefined) {
    return json(400, { ok: false, error: "Invalid lat/long query params" });
  }
  if (
    originLat < -90 ||
    originLat > 90 ||
    originLong < -180 ||
    originLong > 180
  ) {
    return json(400, { ok: false, error: "lat/long out of range" });
  }

  const token = request.cookies.get(authCookie.name)?.value;
  if (!token) return json(401, { ok: false, error: "Unauthorized" });

  const payload = await verifyAuthToken(token);
  if (!payload) return json(401, { ok: false, error: "Unauthorized" });

  const tableName = mustGetEnv("DYNAMODB_TABLE");

  const userEmail = await UserService.getUserEmailByEmail({
    tableName,
    email: payload.email,
  });
  if (!userEmail || userEmail.userId !== payload.userId) {
    return json(401, { ok: false, error: "Unauthorized" });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return json(400, { ok: false, error: "Invalid JSON" });
  }

  const parsed = BodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return json(400, { ok: false, error: "Invalid request" });
  }

  const { id: courtId } = await ctx.params;
  const court = await CourtService.getCourtById({ tableName, courtId });
  if (!court) return json(404, { ok: false, error: "Court not found" });
  if (typeof court.lat !== "number" || typeof court.long !== "number") {
    return json(400, {
      ok: false,
      error: "Court does not have valid coordinates",
    });
  }

  const userProfile = await UserService.getUserProfileByUserId({
    tableName,
    userId: userEmail.userId,
  });
  if (!userProfile)
    return json(404, { ok: false, error: "User profile not found" });

  const latestCheckin = await CheckinService.getLatestCheckinByUserAndCourt({
    tableName,
    courtId,
    userId: userEmail.userId,
  });
  if (
    latestCheckin &&
    Date.now() - new Date(latestCheckin.createdAt).getTime() <
      CHECKIN_COOLDOWN_MS
  ) {
    return json(429, {
      ok: false,
      error: "Check-in cooldown active for this court",
    });
  }

  const distanceMiles = await getGoogleDistanceMiles({
    originLat,
    originLong,
    destinationLat: court.lat,
    destinationLong: court.long,
  });
  if (distanceMiles >= CHECKIN_DISTANCE_LIMIT_MILES) {
    return json(400, {
      ok: false,
      error: "You must be within 0.5 miles of the court to check in",
    });
  }

  const checkin = await CheckinService.createCheckin({
    tableName,
    courtId,
    userId: userEmail.userId,
    userName: userProfile.name,
    status: parsed.data.status,
    photoUrl: parsed.data.photoUrl,
  });

  return json(200, { ok: true, checkin });
}
