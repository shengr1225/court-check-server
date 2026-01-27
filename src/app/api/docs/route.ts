import { NextRequest, NextResponse } from "next/server";
import { swaggerSpec } from "@/lib/swagger";

/**
 * GET /api/docs - Get OpenAPI specification
 * @returns OpenAPI JSON specification
 */
export async function GET(request: NextRequest) {
  try {
    const baseUrl =
      process.env.NEXT_PUBLIC_API_URL ||
      (process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : request.headers.get("host")
        ? `https://${request.headers.get("host")}`
        : "http://localhost:3000");

    const spec = {
      ...swaggerSpec,
      servers: [
        {
          url: baseUrl,
          description: "API Server",
        },
      ],
    };

    return NextResponse.json(spec, {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  } catch (error) {
    console.error("Error generating OpenAPI spec:", error);
    return NextResponse.json(
      { error: "Failed to generate API documentation" },
      { status: 500 }
    );
  }
}
