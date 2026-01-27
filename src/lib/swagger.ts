export const swaggerSpec = {
  openapi: "3.0.0",
  info: {
    title: "Court Check Server API",
    version: "1.0.0",
    description: "API for email OTP authentication and user management",
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
