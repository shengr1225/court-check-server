describe("auth APIs", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env.OTP_MAX_ATTEMPTS = "5";
  });

  test("GET /api/auth/me returns 401 when auth cookie is missing", async () => {
    jest.doMock("@/lib/env", () => ({
      mustGetEnv: jest.fn(() => "table"),
    }));
    jest.doMock("@/lib/auth", () => ({
      authCookie: { name: "auth-token", options: () => ({}) },
      verifyAuthToken: jest.fn(),
      createAuthToken: jest.fn(),
    }));
    jest.doMock("@/services/UserService", () => ({
      UserService: {
        getUserEmailByEmail: jest.fn(),
        getUserProfileByUserId: jest.fn(),
      },
    }));

    const { GET } = await import("@/app/api/auth/me/route");
    const response = await GET({
      cookies: {
        get: () => undefined,
      },
    } as never);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false, error: "Unauthorized" });
  });

  test("GET /api/auth/me returns user with stripeCustomerId", async () => {
    const getUserEmailByEmail = jest
      .fn()
      .mockResolvedValue({ userId: "u1", email: "user@example.com" });
    const getUserProfileByUserId = jest.fn().mockResolvedValue({
      userId: "u1",
      name: "User One",
      checkinCount: 3,
      stripeCustomerId: "cus_123",
    });

    jest.doMock("@/lib/env", () => ({
      mustGetEnv: jest.fn((name: string) => {
        if (name === "DYNAMODB_TABLE") return "table";
        throw new Error(`Unexpected env var: ${name}`);
      }),
    }));
    jest.doMock("@/lib/auth", () => ({
      authCookie: { name: "auth-token", options: () => ({}) },
      verifyAuthToken: jest
        .fn()
        .mockResolvedValue({ userId: "u1", email: "user@example.com" }),
      createAuthToken: jest.fn(),
    }));
    jest.doMock("@/services/UserService", () => ({
      UserService: {
        getUserEmailByEmail,
        getUserProfileByUserId,
      },
    }));

    const { GET } = await import("@/app/api/auth/me/route");
    const response = await GET({
      cookies: {
        get: () => ({ value: "jwt-token" }),
      },
    } as never);

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
  });

  test("POST /api/auth/verify returns 400 on invalid email", async () => {
    jest.doMock("@/lib/env", () => ({
      mustGetEnv: jest.fn(() => "table"),
    }));
    jest.doMock("@/lib/otp", () => ({
      isProbablyValidEmail: jest.fn(() => false),
    }));
    jest.doMock("@/lib/auth", () => ({
      authCookie: { name: "auth-token", options: () => ({}) },
      createAuthToken: jest.fn(),
    }));
    jest.doMock("@/services/OtpService", () => ({
      OtpService: { verifyAndConsumeOtp: jest.fn() },
    }));
    jest.doMock("@/services/UserService", () => ({
      UserService: {
        getUserEmailByEmail: jest.fn(),
      },
    }));

    const { POST } = await import("@/app/api/auth/verify/route");
    const response = await POST(
      new Request("http://localhost/api/auth/verify", {
        method: "POST",
        body: JSON.stringify({ email: "bad", code: "123456" }),
      })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      error: "Invalid email",
    });
  });

  test("POST /api/auth/verify logs in an existing user and sets auth cookie", async () => {
    const createAuthToken = jest.fn(async () => "jwt-token");
    const getUserEmailByEmail = jest
      .fn()
      .mockResolvedValue({ userId: "u1", email: "user@example.com" });
    const getUserProfileByUserId = jest.fn().mockResolvedValue({
      userId: "u1",
      name: "User One",
      checkinCount: 3,
      stripeCustomerId: "cus_123",
    });

    jest.doMock("@/lib/env", () => ({
      mustGetEnv: jest.fn((name: string) => {
        if (name === "DYNAMODB_TABLE") return "table";
        if (name === "OTP_SECRET") return "otp-secret";
        throw new Error(`Unexpected env var: ${name}`);
      }),
    }));
    jest.doMock("@/lib/otp", () => ({
      isProbablyValidEmail: jest.fn(() => true),
    }));
    jest.doMock("@/lib/auth", () => ({
      authCookie: { name: "auth-token", options: () => ({ path: "/" }) },
      createAuthToken,
    }));
    jest.doMock("@/services/OtpService", () => ({
      OtpService: {
        verifyAndConsumeOtp: jest.fn().mockResolvedValue({ ok: true }),
      },
    }));
    jest.doMock("@/services/UserService", () => ({
      UserService: {
        getUserEmailByEmail,
        getUserProfileByUserId,
        createUser: jest.fn(),
        generateUserId: jest.fn(),
      },
    }));

    const { POST } = await import("@/app/api/auth/verify/route");
    const response = await POST(
      new Request("http://localhost/api/auth/verify", {
        method: "POST",
        body: JSON.stringify({ email: "User@Example.com", code: "123456" }),
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
    expect(createAuthToken).toHaveBeenCalledWith({
      userId: "u1",
      email: "user@example.com",
    });
    expect(response.headers.get("set-cookie")).toContain(
      "auth-token=jwt-token"
    );
  });
});
