import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authCookie, verifyAuthToken } from "@/lib/auth";
import { mustGetEnv } from "@/lib/env";
import { CourtStatusSchema } from "@/lib/schemas";
import { CheckinService } from "@/services/CheckinService";
import { UserService } from "@/services/UserService";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

const BodySchema = z.object({
  status: CourtStatusSchema,
  photoUrl: z.string().url().optional(),
});

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
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

  const userProfile = await UserService.getUserProfileByUserId({
    tableName,
    userId: userEmail.userId,
  });
  if (!userProfile)
    return json(404, { ok: false, error: "User profile not found" });

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
