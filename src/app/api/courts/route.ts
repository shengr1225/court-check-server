import { NextResponse } from "next/server";
import { mustGetEnv } from "@/lib/env";
import { CheckinService } from "@/services/CheckinService";
import { CourtService } from "@/services/CourtService";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

export async function GET() {
  const tableName = mustGetEnv("DYNAMODB_TABLE");
  const courts = await CourtService.listCourts({ tableName });
  const checkinsByCourt = await Promise.all(
    courts.map((court) =>
      CheckinService.listCheckinsByCourtId({ tableName, courtId: court.id })
    )
  );
  const courtsWithCheckins = courts.map((court, i) => ({
    ...court,
    checkins: checkinsByCourt[i],
  }));
  return json(200, { ok: true, courts: courtsWithCheckins });
}
