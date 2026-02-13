describe("all APIs integration", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test("GET /api/docs returns OpenAPI spec", async () => {
    const { GET } = await import("@/app/api/docs/route");
    const response = await GET({
      headers: { get: () => "api.example.com" },
    } as never);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.openapi).toBe("3.0.0");
    expect(body.servers[0].url).toBe("https://api.example.com");
  });

  test("POST /api/auth/logout clears auth cookie", async () => {
    jest.doMock("@/lib/auth", () => ({
      authCookie: { name: "auth-token", options: () => ({ path: "/" }) },
    }));

    const { POST } = await import("@/app/api/auth/logout/route");
    const response = await POST();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get("set-cookie")).toContain("auth-token=");
  });

  test("POST /api/auth/request succeeds with real OtpService", async () => {
    const ddbUpdate = jest.fn().mockResolvedValue(undefined);
    const send = jest.fn().mockResolvedValue(undefined);

    jest.doMock("@/lib/env", () => ({
      mustGetEnv: jest.fn((name: string) => {
        if (name === "DYNAMODB_TABLE") return "table";
        if (name === "SES_FROM_EMAIL") return "no-reply@example.com";
        if (name === "OTP_SECRET") return "otp-secret";
        throw new Error(`Unexpected env var: ${name}`);
      }),
    }));
    jest.doMock("@/services/dynamodb", () => ({
      ddbGet: jest.fn(),
      ddbUpdate,
      ddbDelete: jest.fn(),
      ddbTransactWrite: jest.fn(),
      ddbPut: jest.fn(),
      ddbQuery: jest.fn(),
    }));
    jest.doMock("@/lib/aws", () => ({
      ses: () => ({ send }),
    }));

    const { POST } = await import("@/app/api/auth/request/route");
    const response = await POST(
      new Request("http://localhost/api/auth/request", {
        method: "POST",
        body: JSON.stringify({ email: "user@example.com" }),
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(ddbUpdate).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  test("POST /api/auth/verify logs in existing user with real UserService/OtpService", async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const { hmacOtpHash } = await import("@/lib/otp");
    const ddbGet = jest.fn().mockImplementation(async (params) => {
      if (
        params.key.pk === "EMAIL#user@example.com" &&
        params.key.sk === "OTP"
      ) {
        return {
          otpHash: hmacOtpHash({
            secret: "otp-secret",
            email: "user@example.com",
            otp: "123456",
          }),
          expiresAt: nowSec + 600,
          attemptCount: 0,
        };
      }
      if (
        params.key.pk === "EMAIL#user@example.com" &&
        params.key.sk === "USER"
      ) {
        return {
          pk: "EMAIL#user@example.com",
          sk: "USER",
          EntityType: "USER_EMAIL",
          PK: "EMAIL#user@example.com",
          SK: "USER",
          userId: "u1",
          email: "user@example.com",
        };
      }
      if (params.key.pk === "USER#u1" && params.key.sk === "PROFILE") {
        return {
          pk: "USER#u1",
          sk: "PROFILE",
          EntityType: "USER_PROFILE",
          PK: "USER#u1",
          SK: "PROFILE",
          userId: "u1",
          name: "User One",
          checkinCount: 3,
          stripeCustomerId: "cus_123",
        };
      }
      return undefined;
    });
    const ddbDelete = jest.fn().mockResolvedValue(undefined);

    jest.doMock("@/lib/env", () => ({
      mustGetEnv: jest.fn((name: string) => {
        if (name === "DYNAMODB_TABLE") return "table";
        if (name === "OTP_SECRET") return "otp-secret";
        throw new Error(`Unexpected env var: ${name}`);
      }),
    }));
    jest.doMock("@/lib/auth", () => ({
      authCookie: { name: "auth-token", options: () => ({ path: "/" }) },
      createAuthToken: jest.fn().mockResolvedValue("jwt-token"),
    }));
    jest.doMock("@/services/dynamodb", () => ({
      ddbGet,
      ddbDelete,
      ddbUpdate: jest.fn(),
      ddbTransactWrite: jest.fn(),
      ddbPut: jest.fn(),
      ddbQuery: jest.fn(),
    }));

    const { POST } = await import("@/app/api/auth/verify/route");
    const response = await POST(
      new Request("http://localhost/api/auth/verify", {
        method: "POST",
        body: JSON.stringify({ email: "user@example.com", code: "123456" }),
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      user: {
        userId: "u1",
        email: "user@example.com",
        name: "User One",
        checkinCount: 3,
        stripeCustomerId: "cus_123",
      },
    });
    expect(ddbDelete).toHaveBeenCalledTimes(1);
  });

  test("GET /api/auth/me returns profile through real UserService", async () => {
    const ddbGet = jest.fn().mockImplementation(async (params) => {
      if (
        params.key.pk === "EMAIL#user@example.com" &&
        params.key.sk === "USER"
      ) {
        return {
          pk: "EMAIL#user@example.com",
          sk: "USER",
          EntityType: "USER_EMAIL",
          PK: "EMAIL#user@example.com",
          SK: "USER",
          userId: "u1",
          email: "user@example.com",
        };
      }
      if (params.key.pk === "USER#u1" && params.key.sk === "PROFILE") {
        return {
          pk: "USER#u1",
          sk: "PROFILE",
          EntityType: "USER_PROFILE",
          PK: "USER#u1",
          SK: "PROFILE",
          userId: "u1",
          name: "User One",
          checkinCount: 3,
          stripeCustomerId: "cus_123",
        };
      }
      return undefined;
    });

    jest.doMock("@/lib/env", () => ({
      mustGetEnv: jest.fn(() => "table"),
    }));
    jest.doMock("@/lib/auth", () => ({
      authCookie: { name: "auth-token", options: () => ({}) },
      verifyAuthToken: jest
        .fn()
        .mockResolvedValue({ userId: "u1", email: "user@example.com" }),
    }));
    jest.doMock("@/services/dynamodb", () => ({
      ddbGet,
      ddbDelete: jest.fn(),
      ddbUpdate: jest.fn(),
      ddbTransactWrite: jest.fn(),
      ddbPut: jest.fn(),
      ddbQuery: jest.fn(),
    }));

    const { GET } = await import("@/app/api/auth/me/route");
    const response = await GET({
      cookies: { get: () => ({ value: "jwt-token" }) },
    } as never);

    expect(response.status).toBe(200);
    expect((await response.json()).user.stripeCustomerId).toBe("cus_123");
  });

  test("PATCH /api/auth/me updates user name through real UserService", async () => {
    const ddbGet = jest.fn().mockResolvedValue({
      pk: "EMAIL#user@example.com",
      sk: "USER",
      EntityType: "USER_EMAIL",
      PK: "EMAIL#user@example.com",
      SK: "USER",
      userId: "u1",
      email: "user@example.com",
    });
    const ddbUpdate = jest.fn().mockResolvedValue({
      pk: "USER#u1",
      sk: "PROFILE",
      EntityType: "USER_PROFILE",
      PK: "USER#u1",
      SK: "PROFILE",
      userId: "u1",
      name: "Updated Name",
      checkinCount: 4,
    });

    jest.doMock("@/lib/env", () => ({
      mustGetEnv: jest.fn(() => "table"),
    }));
    jest.doMock("@/lib/auth", () => ({
      authCookie: { name: "auth-token", options: () => ({}) },
      verifyAuthToken: jest
        .fn()
        .mockResolvedValue({ userId: "u1", email: "user@example.com" }),
    }));
    jest.doMock("@/services/dynamodb", () => ({
      ddbGet,
      ddbUpdate,
      ddbDelete: jest.fn(),
      ddbTransactWrite: jest.fn(),
      ddbPut: jest.fn(),
      ddbQuery: jest.fn(),
    }));

    const { PATCH } = await import("@/app/api/auth/me/route");
    const response = await PATCH({
      cookies: { get: () => ({ value: "jwt-token" }) },
      json: async () => ({ name: "Updated Name" }),
    } as never);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      user: {
        userId: "u1",
        email: "user@example.com",
        name: "Updated Name",
        checkinCount: 4,
      },
    });
  });

  test("GET /api/courts returns courts with checkins via real CourtService/CheckinService", async () => {
    const ddbQuery = jest.fn().mockImplementation(async (params) => {
      if (params.expressionAttributeValues?.[":pk"] === "COURT") {
        return [
          {
            pk: "COURT",
            sk: "COURT#c1",
            EntityType: "COURT",
            PK: "COURT",
            SK: "COURT#c1",
            id: "c1",
            name: "Court One",
            addressLine: "Addr 1",
            lat: 37.1,
            long: -122.1,
            status: "LOW",
            lastUpdatedAt: "2026-01-01T00:00:00.000Z",
            photoUrl: "https://example.com/c1.png",
          },
        ];
      }
      if (params.expressionAttributeValues?.[":pk"] === "COURT#c1") {
        return [
          {
            pk: "COURT#c1",
            sk: "CHECKIN#2026-01-01T00:00:00.000Z#ck1",
            EntityType: "CHECKIN",
            PK: "COURT#c1",
            SK: "CHECKIN#2026-01-01T00:00:00.000Z#ck1",
            checkinId: "ck1",
            courtId: "c1",
            userId: "u1",
            userName: "User One",
            status: "LOW",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ];
      }
      return [];
    });

    jest.doMock("@/lib/env", () => ({
      mustGetEnv: jest.fn(() => "table"),
    }));
    jest.doMock("@/services/dynamodb", () => ({
      ddbGet: jest.fn(),
      ddbUpdate: jest.fn(),
      ddbDelete: jest.fn(),
      ddbTransactWrite: jest.fn(),
      ddbPut: jest.fn(),
      ddbQuery,
    }));

    const { GET } = await import("@/app/api/courts/route");
    const response = await GET(new Request("http://localhost/api/courts"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.courts[0].id).toBe("c1");
    expect(body.courts[0].checkins).toHaveLength(1);
  });

  test("GET /api/courts/[id] returns court details via real services", async () => {
    const ddbGet = jest.fn().mockResolvedValue({
      pk: "COURT",
      sk: "COURT#c1",
      EntityType: "COURT",
      PK: "COURT",
      SK: "COURT#c1",
      id: "c1",
      name: "Court One",
      addressLine: "Addr 1",
      lat: 37.1,
      long: -122.1,
      status: "LOW",
      lastUpdatedAt: "2026-01-01T00:00:00.000Z",
      photoUrl: "https://example.com/c1.png",
    });
    const ddbQuery = jest.fn().mockResolvedValue([]);

    jest.doMock("@/lib/env", () => ({
      mustGetEnv: jest.fn(() => "table"),
    }));
    jest.doMock("@/services/dynamodb", () => ({
      ddbGet,
      ddbQuery,
      ddbUpdate: jest.fn(),
      ddbDelete: jest.fn(),
      ddbTransactWrite: jest.fn(),
      ddbPut: jest.fn(),
    }));

    const { GET } = await import("@/app/api/courts/[id]/route");
    const response = await GET({} as never, {
      params: Promise.resolve({ id: "c1" }),
    });

    expect(response.status).toBe(200);
    expect((await response.json()).court.id).toBe("c1");
  });

  test("POST /api/courts/[id]/checkin succeeds via real services", async () => {
    const ddbGet = jest.fn().mockImplementation(async (params) => {
      if (
        params.key.pk === "EMAIL#user@example.com" &&
        params.key.sk === "USER"
      ) {
        return {
          pk: "EMAIL#user@example.com",
          sk: "USER",
          EntityType: "USER_EMAIL",
          PK: "EMAIL#user@example.com",
          SK: "USER",
          userId: "u1",
          email: "user@example.com",
        };
      }
      if (params.key.pk === "USER#u1" && params.key.sk === "PROFILE") {
        return {
          pk: "USER#u1",
          sk: "PROFILE",
          EntityType: "USER_PROFILE",
          PK: "USER#u1",
          SK: "PROFILE",
          userId: "u1",
          name: "User One",
          checkinCount: 3,
        };
      }
      if (params.key.pk === "COURT" && params.key.sk === "COURT#c1") {
        return {
          pk: "COURT",
          sk: "COURT#c1",
          EntityType: "COURT",
          PK: "COURT",
          SK: "COURT#c1",
          id: "c1",
          name: "Court One",
          addressLine: "Addr 1",
          lat: 37.1,
          long: -122.1,
          status: "LOW",
          lastUpdatedAt: "2026-01-01T00:00:00.000Z",
          photoUrl: "https://example.com/c1.png",
        };
      }
      return undefined;
    });
    const ddbQuery = jest.fn().mockResolvedValue([]);
    const ddbTransactWrite = jest.fn().mockResolvedValue(undefined);
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "OK",
        rows: [{ elements: [{ status: "OK", distance: { value: 300 } }] }],
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
    jest.doMock("@/services/dynamodb", () => ({
      ddbGet,
      ddbQuery,
      ddbTransactWrite,
      ddbUpdate: jest.fn(),
      ddbDelete: jest.fn(),
      ddbPut: jest.fn(),
    }));

    const { POST } = await import("@/app/api/courts/[id]/checkin/route");
    const response = await POST(
      {
        url: "http://localhost/api/courts/c1/checkin?lat=37&long=-122",
        cookies: { get: () => ({ value: "jwt-token" }) },
        json: async () => ({ status: "LOW" }),
      } as never,
      { params: Promise.resolve({ id: "c1" }) }
    );

    expect(response.status).toBe(200);
    expect((await response.json()).ok).toBe(true);
    expect(ddbTransactWrite).toHaveBeenCalledTimes(1);
  });

  test("POST /api/stripe/payment-sheet succeeds via real UserService", async () => {
    const ddbGet = jest.fn().mockImplementation(async (params) => {
      if (
        params.key.pk === "EMAIL#user@example.com" &&
        params.key.sk === "USER"
      ) {
        return {
          pk: "EMAIL#user@example.com",
          sk: "USER",
          EntityType: "USER_EMAIL",
          PK: "EMAIL#user@example.com",
          SK: "USER",
          userId: "u1",
          email: "user@example.com",
        };
      }
      if (params.key.pk === "USER#u1" && params.key.sk === "PROFILE") {
        return {
          pk: "USER#u1",
          sk: "PROFILE",
          EntityType: "USER_PROFILE",
          PK: "USER#u1",
          SK: "PROFILE",
          userId: "u1",
          name: "User One",
          checkinCount: 3,
        };
      }
      return undefined;
    });
    const ddbUpdate = jest.fn().mockResolvedValue(undefined);
    const stripeClient = {
      customers: { create: jest.fn().mockResolvedValue({ id: "cus_new" }) },
      customerSessions: {
        create: jest.fn().mockResolvedValue({ client_secret: "css_123" }),
      },
      subscriptions: {
        create: jest.fn().mockResolvedValue({
          id: "sub_123",
          status: "trialing",
          pending_setup_intent: { client_secret: "seti_123" },
        }),
      },
      webhooks: { constructEvent: jest.fn() },
    };

    jest.doMock("stripe", () => ({
      __esModule: true,
      default: jest.fn(() => stripeClient),
    }));
    jest.doMock("@/lib/env", () => ({
      mustGetEnv: jest.fn((name: string) => {
        if (name === "STRIPE_SECRET_KEY") return "sk_test";
        if (name === "DYNAMODB_TABLE") return "table";
        if (name === "STRIPE_MONTHLY_PRICE_ID") return "price_123";
        if (name === "STRIPE_PUBLIC_KEY") return "pk_test";
        throw new Error(`Unexpected env var: ${name}`);
      }),
    }));
    jest.doMock("@/lib/auth", () => ({
      authCookie: { name: "auth-token", options: () => ({}) },
      verifyAuthToken: jest
        .fn()
        .mockResolvedValue({ userId: "u1", email: "user@example.com" }),
    }));
    jest.doMock("@/services/dynamodb", () => ({
      ddbGet,
      ddbUpdate,
      ddbDelete: jest.fn(),
      ddbTransactWrite: jest.fn(),
      ddbPut: jest.fn(),
      ddbQuery: jest.fn(),
    }));

    const { POST } = await import("@/app/api/stripe/payment-sheet/route");
    const response = await POST({
      cookies: { get: () => ({ value: "jwt-token" }) },
    } as never);

    expect(response.status).toBe(200);
    expect((await response.json()).customer).toBe("cus_new");
    expect(ddbUpdate).toHaveBeenCalledTimes(1);
  });

  test("GET /api/stripe/[customId] returns subscription via real UserService", async () => {
    const ddbGet = jest.fn().mockImplementation(async (params) => {
      if (
        params.key.pk === "EMAIL#user@example.com" &&
        params.key.sk === "USER"
      ) {
        return {
          pk: "EMAIL#user@example.com",
          sk: "USER",
          EntityType: "USER_EMAIL",
          PK: "EMAIL#user@example.com",
          SK: "USER",
          userId: "u1",
          email: "user@example.com",
        };
      }
      if (params.key.pk === "USER#u1" && params.key.sk === "PROFILE") {
        return {
          pk: "USER#u1",
          sk: "PROFILE",
          EntityType: "USER_PROFILE",
          PK: "USER#u1",
          SK: "PROFILE",
          userId: "u1",
          name: "User One",
          checkinCount: 3,
          stripeCustomerId: "cus_123",
        };
      }
      return undefined;
    });
    const stripeClient = {
      customers: { create: jest.fn(), retrieve: jest.fn() },
      customerSessions: { create: jest.fn() },
      subscriptions: {
        list: jest.fn().mockResolvedValue({
          data: [
            {
              id: "sub_123",
              status: "active",
              trial_end: null,
              cancel_at_period_end: false,
              items: { data: [{ current_period_end: 1735689600 }] },
            },
          ],
        }),
      },
      webhooks: { constructEvent: jest.fn() },
    };

    jest.doMock("stripe", () => ({
      __esModule: true,
      default: jest.fn(() => stripeClient),
    }));
    jest.doMock("@/lib/env", () => ({
      mustGetEnv: jest.fn((name: string) => {
        if (name === "STRIPE_SECRET_KEY") return "sk_test";
        if (name === "DYNAMODB_TABLE") return "table";
        throw new Error(`Unexpected env var: ${name}`);
      }),
    }));
    jest.doMock("@/lib/auth", () => ({
      authCookie: { name: "auth-token", options: () => ({}) },
      verifyAuthToken: jest
        .fn()
        .mockResolvedValue({ userId: "u1", email: "user@example.com" }),
    }));
    jest.doMock("@/services/dynamodb", () => ({
      ddbGet,
      ddbUpdate: jest.fn(),
      ddbDelete: jest.fn(),
      ddbTransactWrite: jest.fn(),
      ddbPut: jest.fn(),
      ddbQuery: jest.fn(),
    }));

    const { GET } = await import("@/app/api/stripe/[customId]/route");
    const response = await GET(
      {
        cookies: { get: () => ({ value: "jwt-token" }) },
      } as never,
      { params: Promise.resolve({ customId: "cus_123" }) }
    );

    expect(response.status).toBe(200);
    expect((await response.json()).subscription.id).toBe("sub_123");
  });

  test("POST /api/stripe/[customId]/unsubscribe updates subscription via real UserService", async () => {
    const ddbGet = jest.fn().mockImplementation(async (params) => {
      if (
        params.key.pk === "EMAIL#user@example.com" &&
        params.key.sk === "USER"
      ) {
        return {
          pk: "EMAIL#user@example.com",
          sk: "USER",
          EntityType: "USER_EMAIL",
          PK: "EMAIL#user@example.com",
          SK: "USER",
          userId: "u1",
          email: "user@example.com",
        };
      }
      if (params.key.pk === "USER#u1" && params.key.sk === "PROFILE") {
        return {
          pk: "USER#u1",
          sk: "PROFILE",
          EntityType: "USER_PROFILE",
          PK: "USER#u1",
          SK: "PROFILE",
          userId: "u1",
          name: "User One",
          checkinCount: 3,
          stripeCustomerId: "cus_123",
        };
      }
      return undefined;
    });
    const stripeClient = {
      customers: { create: jest.fn(), retrieve: jest.fn() },
      customerSessions: { create: jest.fn() },
      subscriptions: {
        create: jest.fn(),
        list: jest.fn().mockResolvedValue({
          data: [
            {
              id: "sub_123",
              items: { data: [{ current_period_end: 1735689600 }] },
            },
          ],
        }),
        update: jest.fn().mockResolvedValue({
          id: "sub_123",
          status: "active",
          trial_end: null,
          cancel_at_period_end: true,
          items: { data: [{ current_period_end: 1735689600 }] },
        }),
      },
      webhooks: { constructEvent: jest.fn() },
    };

    jest.doMock("stripe", () => ({
      __esModule: true,
      default: jest.fn(() => stripeClient),
    }));
    jest.doMock("@/lib/env", () => ({
      mustGetEnv: jest.fn((name: string) => {
        if (name === "STRIPE_SECRET_KEY") return "sk_test";
        if (name === "DYNAMODB_TABLE") return "table";
        throw new Error(`Unexpected env var: ${name}`);
      }),
    }));
    jest.doMock("@/lib/auth", () => ({
      authCookie: { name: "auth-token", options: () => ({}) },
      verifyAuthToken: jest
        .fn()
        .mockResolvedValue({ userId: "u1", email: "user@example.com" }),
    }));
    jest.doMock("@/services/dynamodb", () => ({
      ddbGet,
      ddbUpdate: jest.fn(),
      ddbDelete: jest.fn(),
      ddbTransactWrite: jest.fn(),
      ddbPut: jest.fn(),
      ddbQuery: jest.fn(),
    }));

    const { POST } = await import(
      "@/app/api/stripe/[customId]/unsubscribe/route"
    );
    const response = await POST(
      {
        cookies: { get: () => ({ value: "jwt-token" }) },
      } as never,
      { params: Promise.resolve({ customId: "cus_123" }) }
    );

    expect(response.status).toBe(200);
    expect((await response.json()).subscription.cancelAtPeriodEnd).toBe(true);
  });

  test("POST /api/stripe/[customId]/subscribe updates subscription via real UserService", async () => {
    const ddbGet = jest.fn().mockImplementation(async (params) => {
      if (
        params.key.pk === "EMAIL#user@example.com" &&
        params.key.sk === "USER"
      ) {
        return {
          pk: "EMAIL#user@example.com",
          sk: "USER",
          EntityType: "USER_EMAIL",
          PK: "EMAIL#user@example.com",
          SK: "USER",
          userId: "u1",
          email: "user@example.com",
        };
      }
      if (params.key.pk === "USER#u1" && params.key.sk === "PROFILE") {
        return {
          pk: "USER#u1",
          sk: "PROFILE",
          EntityType: "USER_PROFILE",
          PK: "USER#u1",
          SK: "PROFILE",
          userId: "u1",
          name: "User One",
          checkinCount: 3,
          stripeCustomerId: "cus_123",
        };
      }
      return undefined;
    });
    const stripeClient = {
      customers: { create: jest.fn(), retrieve: jest.fn() },
      customerSessions: { create: jest.fn() },
      subscriptions: {
        create: jest.fn(),
        list: jest.fn().mockResolvedValue({
          data: [
            {
              id: "sub_123",
              items: { data: [{ current_period_end: 1735689600 }] },
            },
          ],
        }),
        update: jest.fn().mockResolvedValue({
          id: "sub_123",
          status: "active",
          trial_end: null,
          cancel_at_period_end: false,
          items: { data: [{ current_period_end: 1735689600 }] },
        }),
      },
      webhooks: { constructEvent: jest.fn() },
    };

    jest.doMock("stripe", () => ({
      __esModule: true,
      default: jest.fn(() => stripeClient),
    }));
    jest.doMock("@/lib/env", () => ({
      mustGetEnv: jest.fn((name: string) => {
        if (name === "STRIPE_SECRET_KEY") return "sk_test";
        if (name === "DYNAMODB_TABLE") return "table";
        throw new Error(`Unexpected env var: ${name}`);
      }),
    }));
    jest.doMock("@/lib/auth", () => ({
      authCookie: { name: "auth-token", options: () => ({}) },
      verifyAuthToken: jest
        .fn()
        .mockResolvedValue({ userId: "u1", email: "user@example.com" }),
    }));
    jest.doMock("@/services/dynamodb", () => ({
      ddbGet,
      ddbUpdate: jest.fn(),
      ddbDelete: jest.fn(),
      ddbTransactWrite: jest.fn(),
      ddbPut: jest.fn(),
      ddbQuery: jest.fn(),
    }));

    const { POST } = await import(
      "@/app/api/stripe/[customId]/subscribe/route"
    );
    const response = await POST(
      {
        cookies: { get: () => ({ value: "jwt-token" }) },
      } as never,
      { params: Promise.resolve({ customId: "cus_123" }) }
    );

    expect(response.status).toBe(200);
    expect((await response.json()).subscription.cancelAtPeriodEnd).toBe(false);
  });

  test("POST /api/stripe/webhook handles invoice event", async () => {
    const send = jest.fn().mockResolvedValue(undefined);
    const stripeClient = {
      customers: { create: jest.fn(), retrieve: jest.fn() },
      customerSessions: { create: jest.fn() },
      subscriptions: { create: jest.fn(), list: jest.fn() },
      webhooks: {
        constructEvent: jest.fn(() => ({
          type: "invoice.payment_succeeded",
          data: {
            object: { id: "in_123", customer_email: "buyer@example.com" },
          },
        })),
      },
    };

    jest.doMock("stripe", () => ({
      __esModule: true,
      default: jest.fn(() => stripeClient),
    }));
    jest.doMock("@/lib/env", () => ({
      mustGetEnv: jest.fn((name: string) => {
        if (name === "STRIPE_SECRET_KEY") return "sk_test";
        if (name === "STRIPE_WEBHOOK_SECRET") return "whsec_123";
        if (name === "SES_FROM_EMAIL") return "no-reply@example.com";
        throw new Error(`Unexpected env var: ${name}`);
      }),
    }));
    jest.doMock("@/lib/aws", () => ({
      ses: () => ({ send }),
    }));
    jest.doMock("@aws-sdk/client-ses", () => ({
      SendEmailCommand: jest.fn().mockImplementation((input) => ({ input })),
    }));

    const { POST } = await import("@/app/api/stripe/webhook/route");
    const response = await POST(
      new Request("http://localhost/api/stripe/webhook", {
        method: "POST",
        headers: { "stripe-signature": "sig_123" },
        body: "payload",
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, received: true });
    expect(send).toHaveBeenCalledTimes(1);
  });
});
