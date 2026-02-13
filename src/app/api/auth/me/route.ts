import { NextRequest, NextResponse } from "next/server";
import { mustGetEnv } from "@/lib/env";
import { authCookie, verifyAuthToken } from "@/lib/auth";
import { UserService } from "@/services/UserService";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get(authCookie.name)?.value;
  if (!token) return json(401, { ok: false, error: "Unauthorized" });

  const payload = await verifyAuthToken(token);
  if (!payload) return json(401, { ok: false, error: "Unauthorized" });

  const tableName = mustGetEnv("DYNAMODB_TABLE");

  const userEmail = await UserService.getUserEmailByEmail({
    tableName,
    email: payload.email,
  });
  if (!userEmail) return json(401, { ok: false, error: "Unauthorized" });

  const userProfile = await UserService.getUserProfileByUserId({
    tableName,
    userId: userEmail.userId,
  });
  if (!userProfile)
    return json(500, { ok: false, error: "User profile not found" });

  return json(200, {
    ok: true,
    user: {
      userId: userEmail.userId,
      email: userEmail.email,
      name: userProfile.name,
      checkinCount: userProfile.checkinCount,
      stripeCustomerId: userProfile.stripeCustomerId,
    },
  });
}

type PatchBody = {
  name?: string;
};

export async function PATCH(request: NextRequest) {
  const token = request.cookies.get(authCookie.name)?.value;
  if (!token) return json(401, { ok: false, error: "Unauthorized" });

  const payload = await verifyAuthToken(token);
  if (!payload) return json(401, { ok: false, error: "Unauthorized" });

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return json(400, { ok: false, error: "Invalid JSON" });
  }

  const name = (body.name || "").trim();
  if (!name || name.length > 256)
    return json(400, { ok: false, error: "Invalid name" });

  const tableName = mustGetEnv("DYNAMODB_TABLE");

  const userEmail = await UserService.getUserEmailByEmail({
    tableName,
    email: payload.email,
  });
  if (!userEmail) return json(401, { ok: false, error: "Unauthorized" });

  const updatedProfile = await UserService.updateUserName({
    tableName,
    userId: userEmail.userId,
    name,
  });

  return json(200, {
    ok: true,
    user: {
      userId: userEmail.userId,
      email: userEmail.email,
      name: updatedProfile.name,
      checkinCount: updatedProfile.checkinCount,
    },
  });
}
