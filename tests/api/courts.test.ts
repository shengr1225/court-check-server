describe("courts API", () => {
  type CourtResponseItem = {
    distanceMiles?: number;
  };

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test("GET /api/courts returns 400 when only lat is provided", async () => {
    jest.doMock("@/lib/env", () => ({
      mustGetEnv: jest.fn(() => "table"),
    }));
    jest.doMock("@/services/CourtService", () => ({
      CourtService: { listCourts: jest.fn() },
    }));
    jest.doMock("@/services/CheckinService", () => ({
      CheckinService: { listCheckinsByCourtId: jest.fn() },
    }));

    const { GET } = await import("@/app/api/courts/route");
    const response = await GET(
      new Request("http://localhost/api/courts?lat=37")
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      error: "Both lat and long query params are required together",
    });
  });

  test("GET /api/courts sorts by distance and returns checkins", async () => {
    const listCourts = jest.fn().mockResolvedValue([
      {
        id: "court-1",
        name: "Court One",
        addressLine: "A",
        lat: 37.1,
        long: -122.1,
      },
      {
        id: "court-2",
        name: "Court Two",
        addressLine: "B",
        lat: 37.2,
        long: -122.2,
      },
    ]);
    const listCheckinsByCourtId = jest
      .fn()
      .mockImplementation((params) =>
        Promise.resolve([
          { checkinId: `ck-${params.courtId}`, courtId: params.courtId },
        ])
      );

    jest.doMock("@/lib/env", () => ({
      mustGetEnv: jest.fn((name: string) => {
        if (name === "DYNAMODB_TABLE") return "table";
        throw new Error(`Unexpected env var: ${name}`);
      }),
    }));
    jest.doMock("@/services/CourtService", () => ({
      CourtService: { listCourts },
    }));
    jest.doMock("@/services/CheckinService", () => ({
      CheckinService: { listCheckinsByCourtId },
    }));

    const { GET } = await import("@/app/api/courts/route");
    const response = await GET(
      new Request("http://localhost/api/courts?lat=37&long=-122")
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.courts).toHaveLength(2);
    expect(body.courts[0].id).toBe("court-1");
    expect(body.courts[1].id).toBe("court-2");
    expect(body.courts[0].distanceMiles).toBeLessThan(
      body.courts[1].distanceMiles
    );
    expect(listCheckinsByCourtId).toHaveBeenCalledTimes(2);
  });

  test("GET /api/courts keeps distanceMiles on all courts when top K covers all", async () => {
    const courts = Array.from({ length: 12 }, (_, i) => ({
      id: `court-${i + 1}`,
      name: `Court ${i + 1}`,
      addressLine: `Addr ${i + 1}`,
      lat: 37 + i * 0.01,
      long: -122 - i * 0.01,
    }));
    const listCourts = jest.fn().mockResolvedValue(courts);
    const listCheckinsByCourtId = jest.fn().mockResolvedValue([]);
    const fetchMock = jest.fn();
    (global as { fetch: typeof fetch }).fetch = fetchMock as typeof fetch;

    jest.doMock("@/lib/env", () => ({
      mustGetEnv: jest.fn((name: string) => {
        if (name === "DYNAMODB_TABLE") return "table";
        throw new Error(`Unexpected env var: ${name}`);
      }),
    }));
    jest.doMock("@/services/CourtService", () => ({
      CourtService: { listCourts },
    }));
    jest.doMock("@/services/CheckinService", () => ({
      CheckinService: { listCheckinsByCourtId },
    }));

    const { GET } = await import("@/app/api/courts/route");
    const response = await GET(
      new Request("http://localhost/api/courts?lat=37&long=-122")
    );

    expect(response.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    const body = (await response.json()) as { courts: CourtResponseItem[] };
    const withDistance = body.courts.filter(
      (court) => typeof court.distanceMiles === "number"
    );
    expect(withDistance).toHaveLength(12);
    expect(listCheckinsByCourtId).toHaveBeenCalledTimes(12);
  });
});
