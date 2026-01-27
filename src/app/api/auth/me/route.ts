import { NextRequest, NextResponse } from "next/server";
import { mustGetEnv } from "@/lib/env";
import { authCookie, verifyAuthToken } from "@/lib/auth";
import { getUserByEmail, getUserProfile } from "@/lib/user";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get(authCookie.name)?.value;
  if (!token) return json(401, { ok: false, error: "Unauthorized" });

  const payload = await verifyAuthToken(token);
  if (!payload) return json(401, { ok: false, error: "Unauthorized" });

  const tableName = mustGetEnv("DYNAMODB_TABLE");

  const userEmail = await getUserByEmail(tableName, payload.email);
  if (!userEmail) return json(401, { ok: false, error: "Unauthorized" });

  const userProfile = await getUserProfile(tableName, userEmail.userId);
  if (!userProfile)
    return json(500, { ok: false, error: "User profile not found" });

  return json(200, {
    ok: true,
    user: {
      userId: userEmail.userId,
      email: userEmail.email,
      name: userProfile.name,
    },
  });
}
