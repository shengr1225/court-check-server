describe("checkin API", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test("POST /api/courts/[id]/checkin returns 400 when lat/long are missing", async () => {
    jest.doMock("@/lib/env", () => ({
      mustGetEnv: jest.fn(),
    }));
    jest.doMock("@/lib/auth", () => ({
      authCookie: { name: "auth-token", options: () => ({}) },
      verifyAuthToken: jest.fn(),
    }));
    jest.doMock("@/services/UserService", () => ({
      UserService: {
        getUserEmailByEmail: jest.fn(),
        getUserProfileByUserId: jest.fn(),
      },
    }));
    jest.doMock("@/services/CourtService", () => ({
      CourtService: {
        getCourtById: jest.fn(),
      },
    }));
    jest.doMock("@/services/CheckinService", () => ({
      CheckinService: {
        getLatestCheckinByUserAndCourt: jest.fn(),
        createCheckin: jest.fn(),
      },
    }));

    const { POST } = await import("@/app/api/courts/[id]/checkin/route");
    const response = await POST(
      new Request("http://localhost/api/courts/c1/checkin", {
        method: "POST",
      }) as never,
      { params: Promise.resolve({ id: "c1" }) }
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      error: "lat and long query params are required",
    });
  });

  test("POST /api/courts/[id]/checkin returns 429 during same-court cooldown", async () => {
    const createCheckin = jest.fn();
    const fetchMock = jest.fn();
    (global as { fetch: typeof fetch }).fetch = fetchMock as typeof fetch;

    jest.doMock("@/lib/env", () => ({
      mustGetEnv: jest.fn((name: string) => {
        if (name === "DYNAMODB_TABLE") return "table";
        if (name === "GOOGLE_API_KEY") return "google-key";
        throw new Error(`Unexpected env var: ${name}`);
      }),
    }));
    jest.doMock("@/lib/auth", () => ({
      authCookie: { name: "auth-token", options: () => ({}) },
      verifyAuthToken: jest
        .fn()
        .mockResolvedValue({ userId: "u1", email: "user@example.com" }),
    }));
    jest.doMock("@/services/UserService", () => ({
      UserService: {
        getUserEmailByEmail: jest
          .fn()
          .mockResolvedValue({ userId: "u1", email: "user@example.com" }),
        getUserProfileByUserId: jest.fn().mockResolvedValue({
          userId: "u1",
          name: "User One",
        }),
      },
    }));
    jest.doMock("@/services/CourtService", () => ({
      CourtService: {
        getCourtById: jest.fn().mockResolvedValue({
          id: "c1",
          name: "Court One",
          addressLine: "A",
          lat: 37.1,
          long: -122.1,
          status: "LOW",
          lastUpdatedAt: "2026-01-01T00:00:00.000Z",
          photoUrl: "https://example.com/court.png",
        }),
      },
    }));
    jest.doMock("@/services/CheckinService", () => ({
      CheckinService: {
        getLatestCheckinByUserAndCourt: jest.fn().mockResolvedValue({
          checkinId: "ck-1",
          courtId: "c1",
          userId: "u1",
          userName: "User One",
          status: "LOW",
          createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        }),
        createCheckin,
      },
    }));

    const { POST } = await import("@/app/api/courts/[id]/checkin/route");
    const response = await POST(
      {
        url: "http://localhost/api/courts/c1/checkin?lat=37&long=-122",
        cookies: { get: () => ({ value: "token" }) },
        json: jest.fn().mockResolvedValue({ status: "LOW" }),
      } as never,
      { params: Promise.resolve({ id: "c1" }) }
    );

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({
      ok: false,
      error: "Check-in cooldown active for this court",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(createCheckin).not.toHaveBeenCalled();
  });

  test("POST /api/courts/[id]/checkin returns 400 when user is too far", async () => {
    const createCheckin = jest.fn();
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "OK",
        rows: [
          {
            elements: [{ status: "OK", distance: { value: 1000 } }],
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
    jest.doMock("@/lib/auth", () => ({
      authCookie: { name: "auth-token", options: () => ({}) },
      verifyAuthToken: jest
        .fn()
        .mockResolvedValue({ userId: "u1", email: "user@example.com" }),
    }));
    jest.doMock("@/services/UserService", () => ({
      UserService: {
        getUserEmailByEmail: jest
          .fn()
          .mockResolvedValue({ userId: "u1", email: "user@example.com" }),
        getUserProfileByUserId: jest.fn().mockResolvedValue({
          userId: "u1",
          name: "User One",
        }),
      },
    }));
    jest.doMock("@/services/CourtService", () => ({
      CourtService: {
        getCourtById: jest.fn().mockResolvedValue({
          id: "c1",
          name: "Court One",
          addressLine: "A",
          lat: 37.1,
          long: -122.1,
          status: "LOW",
          lastUpdatedAt: "2026-01-01T00:00:00.000Z",
          photoUrl: "https://example.com/court.png",
        }),
      },
    }));
    jest.doMock("@/services/CheckinService", () => ({
      CheckinService: {
        getLatestCheckinByUserAndCourt: jest.fn().mockResolvedValue(undefined),
        createCheckin,
      },
    }));

    const { POST } = await import("@/app/api/courts/[id]/checkin/route");
    const response = await POST(
      {
        url: "http://localhost/api/courts/c1/checkin?lat=37&long=-122",
        cookies: { get: () => ({ value: "token" }) },
        json: jest.fn().mockResolvedValue({ status: "LOW" }),
      } as never,
      { params: Promise.resolve({ id: "c1" }) }
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      error: "You must be within 0.5 miles of the court to check in",
    });
    expect(createCheckin).not.toHaveBeenCalled();
  });

  test("POST /api/courts/[id]/checkin creates checkin when within distance and cooldown passed", async () => {
    const createCheckin = jest.fn().mockResolvedValue({
      checkinId: "ck-2",
      courtId: "c1",
      userId: "u1",
      userName: "User One",
      status: "LOW",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "OK",
        rows: [
          {
            elements: [{ status: "OK", distance: { value: 700 } }],
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
    jest.doMock("@/lib/auth", () => ({
      authCookie: { name: "auth-token", options: () => ({}) },
      verifyAuthToken: jest
        .fn()
        .mockResolvedValue({ userId: "u1", email: "user@example.com" }),
    }));
    jest.doMock("@/services/UserService", () => ({
      UserService: {
        getUserEmailByEmail: jest
          .fn()
          .mockResolvedValue({ userId: "u1", email: "user@example.com" }),
        getUserProfileByUserId: jest.fn().mockResolvedValue({
          userId: "u1",
          name: "User One",
        }),
      },
    }));
    jest.doMock("@/services/CourtService", () => ({
      CourtService: {
        getCourtById: jest.fn().mockResolvedValue({
          id: "c1",
          name: "Court One",
          addressLine: "A",
          lat: 37.1,
          long: -122.1,
          status: "LOW",
          lastUpdatedAt: "2026-01-01T00:00:00.000Z",
          photoUrl: "https://example.com/court.png",
        }),
      },
    }));
    jest.doMock("@/services/CheckinService", () => ({
      CheckinService: {
        getLatestCheckinByUserAndCourt: jest.fn().mockResolvedValue({
          checkinId: "ck-1",
          courtId: "c1",
          userId: "u1",
          userName: "User One",
          status: "LOW",
          createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
        }),
        createCheckin,
      },
    }));

    const { POST } = await import("@/app/api/courts/[id]/checkin/route");
    const response = await POST(
      {
        url: "http://localhost/api/courts/c1/checkin?lat=37&long=-122",
        cookies: { get: () => ({ value: "token" }) },
        json: jest.fn().mockResolvedValue({ status: "LOW" }),
      } as never,
      { params: Promise.resolve({ id: "c1" }) }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      checkin: {
        checkinId: "ck-2",
        courtId: "c1",
        userId: "u1",
        userName: "User One",
        status: "LOW",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    });
    expect(createCheckin).toHaveBeenCalledTimes(1);
  });
});
