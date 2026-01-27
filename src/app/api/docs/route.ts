import { NextResponse } from "next/server";
import { swaggerSpec } from "@/lib/swagger";

/**
 * GET /api/docs - Get OpenAPI specification
 * @returns OpenAPI JSON specification
 */
export async function GET() {
  try {
    return NextResponse.json(swaggerSpec, {
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
