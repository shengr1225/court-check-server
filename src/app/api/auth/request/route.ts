import { NextResponse } from "next/server";
import { mustGetEnv } from "@/lib/env";
import { isProbablyValidEmail } from "@/lib/otp";
import { OtpService } from "@/services/OtpService";

type RequestBody = {
  email?: string;
};

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

export async function POST(req: Request) {
  console.log("[otp/request] start");

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    console.log("[otp/request] invalid_json");
    return json(400, { ok: false, error: "Invalid JSON" });
  }

  const email = (body.email || "").toLowerCase().trim();

  console.log("[otp/request] parsed", { email });

  if (!isProbablyValidEmail(email)) {
    console.log("[otp/request] invalid_email", { email });
    return json(400, { ok: false, error: "Invalid email" });
  }

  const tableName = mustGetEnv("DYNAMODB_TABLE");
  const fromEmail = mustGetEnv("SES_FROM_EMAIL");
  const otpSecret = mustGetEnv("OTP_SECRET");

  const ttlSeconds = Number(process.env.OTP_TTL_SECONDS || "600"); // 10 min default
  const minResendSeconds = Number(process.env.OTP_MIN_RESEND_SECONDS || "60");

  if (!Number.isFinite(ttlSeconds) || ttlSeconds < 60 || ttlSeconds > 3600) {
    console.log("[otp/request] bad_config", { name: "OTP_TTL_SECONDS" });
    return json(500, {
      ok: false,
      error: "Bad server config: OTP_TTL_SECONDS",
    });
  }
  if (
    !Number.isFinite(minResendSeconds) ||
    minResendSeconds < 0 ||
    minResendSeconds > 600
  ) {
    console.log("[otp/request] bad_config", { name: "OTP_MIN_RESEND_SECONDS" });
    return json(500, {
      ok: false,
      error: "Bad server config: OTP_MIN_RESEND_SECONDS",
    });
  }

  const res = await OtpService.requestOtp({
    tableName,
    email,
    otpSecret,
    fromEmail,
    ttlSeconds,
    minResendSeconds,
  });

  if (!res.ok) return json(res.status, { ok: false, error: res.error });

  return json(200, { ok: true });
}
