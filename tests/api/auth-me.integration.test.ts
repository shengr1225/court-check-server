describe("auth/me integration", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test("GET /api/auth/me includes stripeCustomerId from persisted profile", async () => {
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
    }));
    jest.doMock("@/services/dynamodb", () => ({
      ddbGet,
      ddbUpdate: jest.fn(),
      ddbDelete: jest.fn(),
      ddbTransactWrite: jest.fn(),
      ddbPut: jest.fn(),
      ddbQuery: jest.fn(),
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
    expect(ddbGet).toHaveBeenCalledTimes(2);
  });
});
