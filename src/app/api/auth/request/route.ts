import { SendEmailCommand } from "@aws-sdk/client-ses";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { NextResponse } from "next/server";
import { ddbDoc, ses } from "@/lib/aws";
import { mustGetEnv } from "@/lib/env";
import { generateOtp6, hmacOtpHash, isProbablyValidEmail } from "@/lib/otp";

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

  const otp = generateOtp6();
  const nowMs = Date.now();
  const nowSec = Math.floor(nowMs / 1000);
  const expiresAt = nowSec + ttlSeconds;
  const minAllowedLastSentAt = nowSec - minResendSeconds;

  const otpHash = hmacOtpHash({ secret: otpSecret, email, otp });

  // PK/SK model so one active OTP per email.
  const pk = `EMAIL#${email}`;
  const sk = "OTP";

  console.log("[otp/request] computed", {
    tableName,
    pk,
    sk,
    nowSec,
    expiresAt,
    minAllowedLastSentAt,
  });

  // Update with a condition to enforce resend cooldown unless previous OTP expired.
  // Note: ConditionExpression is evaluated against the current item (if any).
  try {
    console.log("[otp/request] ddb_update_attempt");
    await ddbDoc().send(
      new UpdateCommand({
        TableName: tableName,
        Key: { pk, sk },
        UpdateExpression:
          "SET otpHash=:otpHash, expiresAt=:expiresAt, lastSentAt=:nowSec, createdAt=:nowIso, attemptCount=:zero ADD sendCount :one",
        ConditionExpression:
          "attribute_not_exists(lastSentAt) OR lastSentAt <= :minAllowedLastSentAt OR expiresAt <= :nowSec",
        ExpressionAttributeValues: {
          ":otpHash": otpHash,
          ":expiresAt": expiresAt,
          ":nowSec": nowSec,
          ":nowIso": new Date(nowMs).toISOString(),
          ":minAllowedLastSentAt": minAllowedLastSentAt,
          ":one": 1,
          ":zero": 0,
        },
      })
    );
    console.log("[otp/request] ddb_update_ok");
  } catch (err: unknown) {
    // ConditionalCheckFailedException is expected when requesting too frequently
    let name: string | undefined;
    if (typeof err === "object" && err !== null) {
      if (
        "name" in err &&
        typeof (err as { name?: unknown }).name === "string"
      ) {
        name = (err as { name: string }).name;
      } else if (
        "__type" in err &&
        typeof (err as { __type?: unknown }).__type === "string"
      ) {
        name = (err as { __type: string }).__type;
      }
    }
    if (name === "ConditionalCheckFailedException") {
      console.log("[otp/request] ddb_update_throttled");
      return json(429, {
        ok: false,
        error: "Please wait before requesting another code",
      });
    }
    console.error("OTP request failed (ddb):", err);
    return json(500, { ok: false, error: "Failed to create OTP" });
  }

  const subject = "Your verification code";
  const textBody = `Your verification code is: ${otp}\n\nThis code will expire in ${Math.ceil(
    ttlSeconds / 60
  )} minutes.\n\nIf you didn't request this, you can ignore this email.`;

  try {
    console.log("[otp/request] ses_send_attempt", {
      fromEmail,
      toEmail: email,
      region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION,
    });
    await ses().send(
      new SendEmailCommand({
        Source: fromEmail,
        Destination: { ToAddresses: [email] },
        Message: {
          Subject: { Data: subject, Charset: "UTF-8" },
          Body: { Text: { Data: textBody, Charset: "UTF-8" } },
        },
      })
    );
    console.log("[otp/request] ses_send_ok");
  } catch (err) {
    // Note: OTP is already stored; that's okay. User can retry send after cooldown.
    const e: Record<string, unknown> =
      typeof err === "object" && err !== null
        ? (err as Record<string, unknown>)
        : {};

    const requestId =
      typeof e["RequestId"] === "string"
        ? (e["RequestId"] as string)
        : typeof e["$metadata"] === "object" &&
          e["$metadata"] !== null &&
          "requestId" in (e["$metadata"] as Record<string, unknown>) &&
          typeof (e["$metadata"] as Record<string, unknown>)["requestId"] ===
            "string"
        ? ((e["$metadata"] as Record<string, unknown>)["requestId"] as string)
        : undefined;

    console.error("OTP request failed (ses):", {
      name: typeof e["name"] === "string" ? (e["name"] as string) : undefined,
      message:
        typeof e["message"] === "string" ? (e["message"] as string) : undefined,
      code:
        typeof e["Code"] === "string"
          ? (e["Code"] as string)
          : typeof e["code"] === "string"
          ? (e["code"] as string)
          : undefined,
      requestId,
      fromEmail,
      toEmail: email,
      region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION,
    });
    return json(500, { ok: false, error: "Failed to send email" });
  }

  console.log("[otp/request] success");
  return json(200, { ok: true });
}
