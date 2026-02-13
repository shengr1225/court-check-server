describe("courts API", () => {
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
      .mockImplementation(({ courtId }: { courtId: string }) =>
        Promise.resolve([{ checkinId: `ck-${courtId}`, courtId }])
      );
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "OK",
        rows: [
          {
            elements: [
              { status: "OK", distance: { value: 3218 } },
              { status: "OK", distance: { value: 1609 } },
            ],
          },
        ],
      }),
    });
    (global as { fetch: typeof fetch }).fetch = fetchMock as typeof fetch;

    jest.doMock("@/lib/env", () => ({
      mustGetEnv: jest.fn((name: string) => {
        if (name === "DYNAMODB_TABLE") return "table";
        if (name === "GOOGLE_API_KEY") return "google-key";
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
    expect(body.courts[0].id).toBe("court-2");
    expect(body.courts[1].id).toBe("court-1");
    expect(body.courts[0].distanceMiles).toBeCloseTo(1, 3);
    expect(body.courts[1].distanceMiles).toBeCloseTo(2, 3);
    expect(listCheckinsByCourtId).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
