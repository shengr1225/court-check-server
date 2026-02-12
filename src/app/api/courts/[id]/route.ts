import { NextResponse } from "next/server";
import { mustGetEnv } from "@/lib/env";
import { CheckinService } from "@/services/CheckinService";
import { CourtService } from "@/services/CourtService";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: courtId } = await ctx.params;
  const tableName = mustGetEnv("DYNAMODB_TABLE");

  const court = await CourtService.getCourtById({ tableName, courtId });
  if (!court) return json(404, { ok: false, error: "Court not found" });

  const checkins = await CheckinService.listCheckinsByCourtId({
    tableName,
    courtId,
  });

  return json(200, { ok: true, court: { ...court, checkins } });
}
