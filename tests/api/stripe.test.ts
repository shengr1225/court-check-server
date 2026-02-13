describe("stripe APIs", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test("POST /api/stripe/payment-sheet returns 401 when auth cookie is missing", async () => {
    jest.doMock("stripe", () => ({
      __esModule: true,
      default: jest.fn(() => ({
        customers: { create: jest.fn(), retrieve: jest.fn() },
        customerSessions: { create: jest.fn() },
        subscriptions: { create: jest.fn() },
        webhooks: { constructEvent: jest.fn() },
      })),
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
      verifyAuthToken: jest.fn(),
    }));
    jest.doMock("@/services/UserService", () => ({
      UserService: {
        getUserEmailByEmail: jest.fn(),
        getUserProfileByUserId: jest.fn(),
        setStripeCustomerId: jest.fn(),
      },
    }));

    const { POST } = await import("@/app/api/stripe/payment-sheet/route");
    const response = await POST({
      cookies: {
        get: () => undefined,
      },
    } as never);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false, error: "Unauthorized" });
  });

  test("POST /api/stripe/payment-sheet creates customer and returns payment payload", async () => {
    const getUserEmailByEmail = jest
      .fn()
      .mockResolvedValue({ userId: "u1", email: "user@example.com" });
    const getUserProfileByUserId = jest.fn().mockResolvedValue({
      userId: "u1",
      name: "User One",
      checkinCount: 3,
    });
    const setStripeCustomerId = jest.fn().mockResolvedValue(undefined);
    const stripeClient = {
      customers: {
        create: jest.fn().mockResolvedValue({ id: "cus_new" }),
        retrieve: jest.fn(),
      },
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
    jest.doMock("@/services/UserService", () => ({
      UserService: {
        getUserEmailByEmail,
        getUserProfileByUserId,
        setStripeCustomerId,
      },
    }));

    const { POST } = await import("@/app/api/stripe/payment-sheet/route");
    const response = await POST({
      cookies: {
        get: () => ({ value: "jwt-token" }),
      },
    } as never);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      subscriptionId: "sub_123",
      subscriptionStatus: "trialing",
      setupIntentClientSecret: "seti_123",
      pendingSetupIntentClientSecret: "seti_123",
      customerSessionClientSecret: "css_123",
      customer: "cus_new",
      publishableKey: "pk_test",
    });
    expect(stripeClient.customers.create).toHaveBeenCalledWith({
      email: "user@example.com",
      metadata: { userId: "u1" },
    });
    expect(setStripeCustomerId).toHaveBeenCalledWith({
      tableName: "table",
      userId: "u1",
      stripeCustomerId: "cus_new",
    });
  });

  test("POST /api/stripe/webhook sends email on successful invoice payment", async () => {
    const send = jest.fn().mockResolvedValue(undefined);
    const stripeClient = {
      customers: { create: jest.fn(), retrieve: jest.fn() },
      customerSessions: { create: jest.fn() },
      subscriptions: { create: jest.fn() },
      webhooks: {
        constructEvent: jest.fn(() => ({
          type: "invoice.payment_succeeded",
          data: {
            object: {
              id: "in_123",
              customer_email: "buyer@example.com",
            },
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
        headers: {
          "stripe-signature": "sig_123",
        },
        body: "payload-body",
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, received: true });
    expect(send).toHaveBeenCalledTimes(1);
  });
});
