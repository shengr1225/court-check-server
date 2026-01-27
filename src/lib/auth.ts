import { SignJWT, jwtVerify } from "jose";
import { mustGetEnv } from "@/lib/env";

export type AuthUser = {
  userId: string;
  email: string;
  name: string;
};

type AuthTokenPayload = {
  userId: string;
  email: string;
};

const AUTH_COOKIE_NAME = "auth-token";

function getJwtSecret(): Uint8Array {
  return new TextEncoder().encode(mustGetEnv("JWT_SECRET"));
}

export async function createAuthToken(
  payload: AuthTokenPayload
): Promise<string> {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getJwtSecret());
}

export async function verifyAuthToken(
  token: string
): Promise<AuthTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    const userId = typeof payload.userId === "string" ? payload.userId : null;
    const email = typeof payload.email === "string" ? payload.email : null;
    if (!userId || !email) return null;
    return { userId, email };
  } catch {
    return null;
  }
}

export const authCookie = {
  name: AUTH_COOKIE_NAME,
  options(): {
    httpOnly: true;
    secure: boolean;
    sameSite: "lax";
    maxAge: number;
    path: "/";
  } {
    return {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    };
  },
};
