import { NextResponse } from "next/server";
import { authCookie } from "@/lib/auth";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

export async function POST() {
  const res = json(200, { ok: true });
  res.cookies.set(authCookie.name, "", { ...authCookie.options(), maxAge: 0 });
  return res;
}
