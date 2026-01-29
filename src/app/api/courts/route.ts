import { NextResponse } from "next/server";
import { mustGetEnv } from "@/lib/env";
import { CourtService } from "@/services/CourtService";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

export async function GET() {
  const tableName = mustGetEnv("DYNAMODB_TABLE");
  const courts = await CourtService.listCourts({ tableName });
  return json(200, { ok: true, courts });
}
