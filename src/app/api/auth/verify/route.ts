import {
  DeleteCommand,
  GetCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { NextResponse } from "next/server";
import { ddbDoc } from "@/lib/aws";
import { mustGetEnv } from "@/lib/env";
import {
  hmacOtpHash,
  isProbablyValidEmail,
  timingSafeEqualHex,
} from "@/lib/otp";
import { createUser, getUserByEmail, getUserProfile } from "@/lib/user";
import { authCookie, createAuthToken } from "@/lib/auth";

type RequestBody = {
  email?: string;
  code?: string;
  name?: string;
};

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

export async function POST(req: Request) {
  console.log("[otp/verify] start");

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    console.log("[otp/verify] invalid_json");
    return json(400, { ok: false, error: "Invalid JSON" });
  }

  const email = (body.email || "").toLowerCase().trim();
  const code = (body.code || "").trim();
  const name = (body.name || "").trim();

  console.log("[otp/verify] parsed", { email });

  if (!isProbablyValidEmail(email))
    return json(400, { ok: false, error: "Invalid email" });
  if (!/^\d{6}$/.test(code))
    return json(400, { ok: false, error: "Invalid code" });

  const tableName = mustGetEnv("DYNAMODB_TABLE");
  const otpSecret = mustGetEnv("OTP_SECRET");
  const maxAttempts = Number(process.env.OTP_MAX_ATTEMPTS || "5");

  if (!Number.isFinite(maxAttempts) || maxAttempts < 1 || maxAttempts > 20) {
    return json(500, {
      ok: false,
      error: "Bad server config: OTP_MAX_ATTEMPTS",
    });
  }

  const pk = `EMAIL#${email}`;
  const sk = "OTP";

  const nowSec = Math.floor(Date.now() / 1000);

  type OtpItem = {
    otpHash?: string;
    expiresAt?: number;
    attemptCount?: number;
  };

  let item: OtpItem | undefined;

  try {
    const res = await ddbDoc().send(
      new GetCommand({
        TableName: tableName,
        Key: { pk, sk },
        ConsistentRead: true,
      })
    );
    item = res.Item as OtpItem | undefined;
  } catch (err) {
    console.error("OTP verify failed (ddb get):", err);
    return json(500, { ok: false, error: "Failed to verify code" });
  }

  if (!item?.otpHash || !item?.expiresAt) {
    return json(400, { ok: false, error: "Invalid or expired code" });
  }

  if (item.expiresAt <= nowSec) {
    // Best-effort cleanup
    try {
      await ddbDoc().send(
        new DeleteCommand({ TableName: tableName, Key: { pk, sk } })
      );
    } catch {
      // ignore
    }
    return json(400, { ok: false, error: "Invalid or expired code" });
  }

  const expected = item.otpHash;
  const actual = hmacOtpHash({ secret: otpSecret, email, otp: code });
  const ok = timingSafeEqualHex(expected, actual);

  if (ok) {
    try {
      await ddbDoc().send(
        new DeleteCommand({ TableName: tableName, Key: { pk, sk } })
      );
    } catch (err) {
      console.error("[otp/verify] cleanup_failed:", err);
    }

    const userEmail = await getUserByEmail(tableName, email);

    if (userEmail) {
      const userProfile = await getUserProfile(tableName, userEmail.userId);
      if (!userProfile) {
        console.log("[otp/verify] profile_not_found", {
          userId: userEmail.userId,
        });
        return json(500, { ok: false, error: "User profile not found" });
      }

      console.log("[otp/verify] login_success", { userId: userEmail.userId });
      const res = NextResponse.json(
        {
          ok: true,
          user: {
            userId: userEmail.userId,
            email: userEmail.email,
            name: userProfile.name,
          },
        },
        { status: 200 }
      );
      const token = await createAuthToken({
        userId: userEmail.userId,
        email: userEmail.email,
      });
      res.cookies.set(authCookie.name, token, authCookie.options());
      return res;
    }

    const userName =
      name && name.length > 0 && name.length <= 256
        ? name
        : email.split("@")[0];

    try {
      const { userId, userProfile } = await createUser(
        tableName,
        email,
        userName
      );
      console.log("[otp/verify] user_created", { userId });
      const res = NextResponse.json(
        {
          ok: true,
          user: {
            userId,
            email,
            name: userProfile.name,
          },
        },
        { status: 200 }
      );
      const token = await createAuthToken({ userId, email });
      res.cookies.set(authCookie.name, token, authCookie.options());
      return res;
    } catch (err: unknown) {
      let errName: string | undefined;
      if (typeof err === "object" && err !== null) {
        if (
          "name" in err &&
          typeof (err as { name?: unknown }).name === "string"
        ) {
          errName = (err as { name: string }).name;
        } else if (
          "__type" in err &&
          typeof (err as { __type?: unknown }).__type === "string"
        ) {
          errName = (err as { __type: string }).__type;
        }
      }

      if (errName === "TransactionCanceledException") {
        console.log("[otp/verify] user_created_concurrently", { email });
        const existingUserEmail = await getUserByEmail(tableName, email);
        if (existingUserEmail) {
          const existingUserProfile = await getUserProfile(
            tableName,
            existingUserEmail.userId
          );
          if (existingUserProfile) {
            const res = NextResponse.json(
              {
                ok: true,
                user: {
                  userId: existingUserEmail.userId,
                  email: existingUserEmail.email,
                  name: existingUserProfile.name,
                },
              },
              { status: 200 }
            );
            const token = await createAuthToken({
              userId: existingUserEmail.userId,
              email: existingUserEmail.email,
            });
            res.cookies.set(authCookie.name, token, authCookie.options());
            return res;
          }
        }
        return json(409, { ok: false, error: "User already exists" });
      }

      console.error("[otp/verify] create_user_failed:", err);
      return json(500, { ok: false, error: "Failed to create user" });
    }
  }

  // Wrong code: increment attempts, and optionally lock out/delete if exceeded.
  try {
    const res = await ddbDoc().send(
      new UpdateCommand({
        TableName: tableName,
        Key: { pk, sk },
        UpdateExpression: "ADD attemptCount :one",
        ExpressionAttributeValues: { ":one": 1 },
        ReturnValues: "ALL_NEW",
      })
    );
    const newAttemptCount = Number(
      (res.Attributes as OtpItem | undefined)?.attemptCount || 0
    );
    if (newAttemptCount >= maxAttempts) {
      await ddbDoc().send(
        new DeleteCommand({ TableName: tableName, Key: { pk, sk } })
      );
    }
  } catch (err) {
    console.error("[otp/verify] update_attempts_failed:", err);
  }

  console.log("[otp/verify] invalid_code");
  return json(400, { ok: false, error: "Invalid or expired code" });
}
