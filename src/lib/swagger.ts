export const swaggerSpec = {
  openapi: "3.0.0",
  info: {
    title: "Court Check Server API",
    version: "1.0.0",
    description:
      "API for email OTP authentication, court/checkin management, and Stripe payments",
  },
  servers: [
    {
      url:
        process.env.NEXT_PUBLIC_API_URL ||
        (process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : "http://localhost:3000"),
      description: "API Server",
    },
  ],
  paths: {
    "/api/courts": {
      get: {
        summary: "List courts",
        description:
          "Returns a list of pickleball courts with status, last updated timestamp, photo URL, and associated checkins.",
        operationId: "listCourts",
        tags: ["Courts"],
        parameters: [
          {
            name: "lat",
            in: "query",
            required: false,
            schema: { type: "number", format: "double" },
            description:
              "Optional latitude. Must be used with long. When provided, courts are sorted by nearest distance from this coordinate.",
          },
          {
            name: "long",
            in: "query",
            required: false,
            schema: { type: "number", format: "double" },
            description:
              "Optional longitude. Must be used with lat. When provided, courts are sorted by nearest distance from this coordinate.",
          },
        ],
        responses: {
          "200": {
            description: "Courts list",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean", example: true },
                    courts: {
                      type: "array",
                      items: { $ref: "#/components/schemas/CourtWithCheckins" },
                    },
                  },
                  required: ["ok", "courts"],
                },
              },
            },
          },
          "400": {
            description: "Invalid query params",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
                example: { ok: false, error: "Invalid lat/long query params" },
              },
            },
          },
        },
      },
    },
    "/api/courts/{id}": {
      get: {
        summary: "Get court by ID",
        description: "Returns a single court with its checkins by court ID.",
        operationId: "getCourtById",
        tags: ["Courts"],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Court ID",
          },
        ],
        responses: {
          "200": {
            description: "Court with checkins",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean", example: true },
                    court: { $ref: "#/components/schemas/CourtWithCheckins" },
                  },
                  required: ["ok", "court"],
                },
              },
            },
          },
          "404": {
            description: "Court not found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
                example: { ok: false, error: "Court not found" },
              },
            },
          },
        },
      },
    },
    "/api/courts/{id}/checkin": {
      post: {
        summary: "Create a check-in",
        description:
          "Creates a check-in for a court. The check-in is associated with the authenticated user.",
        operationId: "createCourtCheckin",
        tags: ["Courts"],
        security: [{ cookieAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Court ID",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["status"],
                properties: {
                  status: { $ref: "#/components/schemas/CourtStatus" },
                  photoUrl: { type: "string", format: "uri" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Created check-in",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean", example: true },
                    checkin: { $ref: "#/components/schemas/Checkin" },
                  },
                  required: ["ok", "checkin"],
                },
              },
            },
          },
          "400": {
            description: "Invalid request",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
                example: { ok: false, error: "Invalid request" },
              },
            },
          },
          "401": {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
                example: { ok: false, error: "Unauthorized" },
              },
            },
          },
        },
      },
    },
    "/api/auth/request": {
      post: {
        summary: "Request OTP",
        description:
          "Request a one-time password (OTP) to be sent to the provided email address. The OTP will be sent via email and stored in the database.",
        operationId: "requestOtp",
        tags: ["Authentication"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email"],
                properties: {
                  email: {
                    type: "string",
                    format: "email",
                    description: "Email address to send OTP to",
                    example: "user@example.com",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "OTP sent successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: {
                      type: "boolean",
                      example: true,
                    },
                  },
                },
              },
            },
          },
          "400": {
            description: "Invalid request",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
                example: {
                  ok: false,
                  error: "Invalid email",
                },
              },
            },
          },
          "429": {
            description: "Too many requests - rate limited",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
                example: {
                  ok: false,
                  error: "Please wait before requesting another code",
                },
              },
            },
          },
          "500": {
            description: "Internal server error",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
                example: {
                  ok: false,
                  error: "Failed to send email",
                },
              },
            },
          },
        },
      },
    },
    "/api/auth/verify": {
      post: {
        summary: "Verify OTP and Authenticate",
        description:
          "Verify the OTP code and authenticate the user. If the user exists, they will be logged in. If the user doesn't exist, a new account will be created. On success, an httpOnly cookie is set.",
        operationId: "verifyOtp",
        tags: ["Authentication"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "code"],
                properties: {
                  email: {
                    type: "string",
                    format: "email",
                    description: "Email address used to request OTP",
                    example: "user@example.com",
                  },
                  code: {
                    type: "string",
                    pattern: "^\\d{6}$",
                    description: "6-digit OTP code",
                    example: "123456",
                  },
                  name: {
                    type: "string",
                    minLength: 1,
                    maxLength: 256,
                    description:
                      "User's name (optional; if omitted for new users, a name will be derived)",
                    example: "John Doe",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "OTP verified successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: {
                      type: "boolean",
                      example: true,
                    },
                    user: {
                      $ref: "#/components/schemas/User",
                    },
                  },
                },
                examples: {
                  login: {
                    summary: "Existing user login",
                    value: {
                      ok: true,
                      user: {
                        userId: "550e8400-e29b-41d4-a716-446655440000",
                        email: "user@example.com",
                        name: "John Doe",
                      },
                    },
                  },
                  register: {
                    summary: "New user registration",
                    value: {
                      ok: true,
                      user: {
                        userId: "550e8400-e29b-41d4-a716-446655440000",
                        email: "newuser@example.com",
                        name: "Jane Smith",
                      },
                    },
                  },
                },
              },
            },
          },
          "400": {
            description: "Invalid request or OTP code",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
                examples: {
                  invalidCode: {
                    summary: "Invalid or expired code",
                    value: {
                      ok: false,
                      error: "Invalid or expired code",
                    },
                  },
                },
              },
            },
          },
          "409": {
            description: "User already exists (concurrent registration)",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
                example: {
                  ok: false,
                  error: "User already exists",
                },
              },
            },
          },
          "500": {
            description: "Internal server error",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
                example: {
                  ok: false,
                  error: "Failed to verify code",
                },
              },
            },
          },
        },
      },
    },
    "/api/auth/me": {
      get: {
        summary: "Get current user",
        description:
          "Returns the current authenticated user using the httpOnly auth cookie.",
        operationId: "getCurrentUser",
        tags: ["Authentication"],
        security: [{ cookieAuth: [] }],
        responses: {
          "200": {
            description: "Current user",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean", example: true },
                    user: { $ref: "#/components/schemas/User" },
                  },
                  required: ["ok", "user"],
                },
              },
            },
          },
          "401": {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
                example: { ok: false, error: "Unauthorized" },
              },
            },
          },
        },
      },
      patch: {
        summary: "Update current user's name",
        description:
          "Updates the current user's profile name using the httpOnly auth cookie.",
        operationId: "updateCurrentUserName",
        tags: ["Authentication"],
        security: [{ cookieAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name"],
                properties: {
                  name: {
                    type: "string",
                    minLength: 1,
                    maxLength: 256,
                    example: "New Name",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Updated user",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean", example: true },
                    user: { $ref: "#/components/schemas/User" },
                  },
                  required: ["ok", "user"],
                },
              },
            },
          },
          "400": {
            description: "Invalid request",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
                example: { ok: false, error: "Invalid name" },
              },
            },
          },
          "401": {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
                example: { ok: false, error: "Unauthorized" },
              },
            },
          },
        },
      },
    },
    "/api/stripe/payment-sheet": {
      post: {
        summary: "Create payment sheet",
        description:
          "Creates a Stripe monthly subscription with a 7-day free trial for the authenticated user. Returns setup intent client secret, customer session client secret, customer id, and publishable key for client-side Stripe integration.",
        operationId: "createPaymentSheet",
        tags: ["Stripe"],
        security: [{ cookieAuth: [] }],
        responses: {
          "200": {
            description: "Payment sheet data",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean", example: true },
                    subscriptionId: {
                      type: "string",
                      description: "Stripe subscription ID",
                    },
                    subscriptionStatus: {
                      type: "string",
                      description: "Stripe subscription status",
                    },
                    setupIntentClientSecret: {
                      type: "string",
                      nullable: true,
                      description: "SetupIntent client secret for PaymentSheet",
                    },
                    pendingSetupIntentClientSecret: {
                      type: "string",
                      nullable: true,
                      description:
                        "Alias of setup intent client secret for compatibility",
                    },
                    customerSessionClientSecret: {
                      type: "string",
                      description: "Customer session client secret",
                    },
                    customer: {
                      type: "string",
                      description: "Stripe customer ID",
                    },
                    publishableKey: {
                      type: "string",
                      description: "Stripe publishable key for client",
                    },
                  },
                  required: [
                    "ok",
                    "subscriptionId",
                    "subscriptionStatus",
                    "setupIntentClientSecret",
                    "customerSessionClientSecret",
                    "customer",
                    "publishableKey",
                  ],
                },
              },
            },
          },
          "401": {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
                example: { ok: false, error: "Unauthorized" },
              },
            },
          },
          "500": {
            description: "Server configuration error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
                example: {
                  ok: false,
                  error: "Bad server config: STRIPE_MONTHLY_PRICE_ID",
                },
              },
            },
          },
        },
      },
    },
    "/api/stripe/webhook": {
      post: {
        summary: "Stripe webhook",
        description:
          "Stripe webhook endpoint for subscription lifecycle events. Called by Stripe servers, not by clients. Requires stripe-signature header for verification. Handles invoice.payment_succeeded, invoice.payment_failed, customer.subscription.updated, and customer.subscription.deleted.",
        operationId: "stripeWebhook",
        tags: ["Stripe"],
        parameters: [
          {
            name: "stripe-signature",
            in: "header",
            required: true,
            schema: { type: "string" },
            description: "Stripe webhook signature for verification",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { type: "object", description: "Stripe event payload" },
            },
          },
        },
        responses: {
          "200": {
            description: "Webhook received",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean", example: true },
                    received: { type: "boolean", example: true },
                  },
                  required: ["ok", "received"],
                },
              },
            },
          },
          "400": {
            description: "Invalid signature",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
                example: { ok: false, error: "Invalid signature" },
              },
            },
          },
        },
      },
    },
    "/api/stripe/{customId}": {
      get: {
        summary: "Get current user's subscription",
        description:
          "Returns the authenticated user's latest Stripe subscription for the provided Stripe customer ID.",
        operationId: "getCurrentUserSubscription",
        tags: ["Stripe"],
        security: [{ cookieAuth: [] }],
        parameters: [
          {
            name: "customId",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Stripe customer ID",
          },
        ],
        responses: {
          "200": {
            description: "Subscription details",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean", example: true },
                    subscription: {
                      type: "object",
                      nullable: true,
                      properties: {
                        id: { type: "string" },
                        status: { type: "string" },
                        trialEnd: {
                          type: "integer",
                          nullable: true,
                          description: "Unix timestamp",
                        },
                        currentPeriodEnd: {
                          type: "integer",
                          description: "Unix timestamp",
                        },
                        cancelAtPeriodEnd: { type: "boolean" },
                        customer: { type: "string" },
                      },
                      required: [
                        "id",
                        "status",
                        "currentPeriodEnd",
                        "cancelAtPeriodEnd",
                        "customer",
                      ],
                    },
                  },
                  required: ["ok", "subscription"],
                },
              },
            },
          },
          "401": {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
                example: { ok: false, error: "Unauthorized" },
              },
            },
          },
          "403": {
            description: "Forbidden",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
                example: { ok: false, error: "Forbidden" },
              },
            },
          },
          "404": {
            description: "Stripe customer not found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
                example: { ok: false, error: "Stripe customer not found" },
              },
            },
          },
        },
      },
    },
    "/api/auth/logout": {
      post: {
        summary: "Logout",
        description: "Clears the auth cookie.",
        operationId: "logout",
        tags: ["Authentication"],
        security: [{ cookieAuth: [] }],
        responses: {
          "200": {
            description: "Logged out",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { ok: { type: "boolean", example: true } },
                  required: ["ok"],
                },
              },
            },
          },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      cookieAuth: {
        type: "apiKey",
        in: "cookie",
        name: "auth-token",
      },
    },
    schemas: {
      Court: {
        type: "object",
        properties: {
          id: { type: "string", description: "Court identifier" },
          name: { type: "string", description: "Court name" },
          addressLine: { type: "string", description: "Court address line" },
          lat: {
            type: "number",
            format: "double",
            description: "Latitude coordinate",
            example: 36.1699,
          },
          long: {
            type: "number",
            format: "double",
            description: "Longitude coordinate",
            example: -115.1398,
          },
          courtCount: {
            type: "integer",
            description: "Number of courts at this location",
            example: 8,
          },
          status: { $ref: "#/components/schemas/CourtStatus" },
          lastUpdatedAt: {
            type: "string",
            format: "date-time",
            description: "ISO timestamp of last status update",
          },
          photoUrl: {
            type: "string",
            format: "uri",
            description: "URL to a court photo",
          },
          distanceMiles: {
            type: "number",
            description:
              "Distance in miles from query lat/long. Present on list endpoint when lat and long query params are provided.",
            example: 1.15,
          },
        },
        required: [
          "id",
          "name",
          "addressLine",
          "status",
          "lastUpdatedAt",
          "photoUrl",
        ],
      },
      CourtWithCheckins: {
        allOf: [
          { $ref: "#/components/schemas/Court" },
          {
            type: "object",
            properties: {
              checkins: {
                type: "array",
                items: { $ref: "#/components/schemas/Checkin" },
                description: "Checkins for this court",
              },
            },
            required: ["checkins"],
          },
        ],
      },
      CourtStatus: {
        type: "string",
        enum: ["EMPTY", "LOW", "MEDIUM", "CROWDED"],
      },
      Checkin: {
        type: "object",
        properties: {
          checkinId: { type: "string", description: "Check-in identifier" },
          courtId: { type: "string", description: "Court ID" },
          userId: { type: "string", description: "User ID" },
          userName: {
            type: "string",
            description: "User name at check-in time",
          },
          status: { $ref: "#/components/schemas/CourtStatus" },
          createdAt: { type: "string", format: "date-time" },
          photoUrl: { type: "string", format: "uri" },
        },
        required: ["checkinId", "courtId", "userId", "status", "createdAt"],
      },
      User: {
        type: "object",
        properties: {
          userId: {
            type: "string",
            format: "uuid",
            description: "Unique user identifier",
            example: "550e8400-e29b-41d4-a716-446655440000",
          },
          email: {
            type: "string",
            format: "email",
            description: "User's email address",
            example: "user@example.com",
          },
          name: {
            type: "string",
            description: "User's name",
            example: "John Doe",
          },
          checkinCount: {
            type: "integer",
            description: "Monthly check-in count",
            example: 3,
          },
        },
        required: ["userId", "email", "name"],
      },
      ErrorResponse: {
        type: "object",
        properties: {
          ok: {
            type: "boolean",
            example: false,
          },
          error: {
            type: "string",
            description: "Error message",
            example: "Invalid email",
          },
        },
        required: ["ok", "error"],
      },
    },
  },
};
