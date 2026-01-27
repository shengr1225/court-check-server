import { SendEmailCommand } from "@aws-sdk/client-ses";
import { ses } from "@/lib/aws";
import { ddbDelete, ddbGet, ddbUpdate } from "@/services/dynamodb";
import { generateOtp6, hmacOtpHash, timingSafeEqualHex } from "@/lib/otp";

type OtpItem = {
  otpHash?: string;
  expiresAt?: number;
  attemptCount?: number;
  lastSentAt?: number;
};

export const OtpService = {
  async requestOtp(params: {
    tableName: string;
    email: string;
    otpSecret: string;
    fromEmail: string;
    ttlSeconds: number;
    minResendSeconds: number;
  }): Promise<
    | { ok: true }
    | {
        ok: false;
        status: 429;
        error: "Please wait before requesting another code";
      }
    | {
        ok: false;
        status: 500;
        error: "Failed to create OTP" | "Failed to send email";
      }
  > {
    const otp = generateOtp6();
    const nowMs = Date.now();
    const nowSec = Math.floor(nowMs / 1000);
    const expiresAt = nowSec + params.ttlSeconds;
    const minAllowedLastSentAt = nowSec - params.minResendSeconds;

    const pk = `EMAIL#${params.email}`;
    const sk = "OTP";

    const otpHash = hmacOtpHash({
      secret: params.otpSecret,
      email: params.email,
      otp,
    });

    try {
      await ddbUpdate({
        TableName: params.tableName,
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
      });
    } catch (err: unknown) {
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
        return {
          ok: false,
          status: 429,
          error: "Please wait before requesting another code",
        };
      }
      return { ok: false, status: 500, error: "Failed to create OTP" };
    }

    const subject = "Your verification code";
    const textBody = `Your verification code is: ${otp}\n\nThis code will expire in ${Math.ceil(
      params.ttlSeconds / 60
    )} minutes.\n\nIf you didn't request this, you can ignore this email.`;

    try {
      await ses().send(
        new SendEmailCommand({
          Source: params.fromEmail,
          Destination: { ToAddresses: [params.email] },
          Message: {
            Subject: { Data: subject, Charset: "UTF-8" },
            Body: { Text: { Data: textBody, Charset: "UTF-8" } },
          },
        })
      );
    } catch {
      return { ok: false, status: 500, error: "Failed to send email" };
    }

    return { ok: true };
  },

  async verifyAndConsumeOtp(params: {
    tableName: string;
    email: string;
    otpSecret: string;
    code: string;
    maxAttempts: number;
  }): Promise<
    | { ok: true }
    | { ok: false; status: 400; error: "Invalid or expired code" }
    | { ok: false; status: 500; error: "Failed to verify code" }
  > {
    const pk = `EMAIL#${params.email}`;
    const sk = "OTP";
    const nowSec = Math.floor(Date.now() / 1000);

    let item: OtpItem | undefined;
    try {
      item = await ddbGet<OtpItem>({
        tableName: params.tableName,
        key: { pk, sk },
      });
    } catch {
      return { ok: false, status: 500, error: "Failed to verify code" };
    }

    if (!item?.otpHash || !item?.expiresAt) {
      return { ok: false, status: 400, error: "Invalid or expired code" };
    }

    if (item.expiresAt <= nowSec) {
      try {
        await ddbDelete({ TableName: params.tableName, Key: { pk, sk } });
      } catch {
        // ignore
      }
      return { ok: false, status: 400, error: "Invalid or expired code" };
    }

    const expected = item.otpHash;
    const actual = hmacOtpHash({
      secret: params.otpSecret,
      email: params.email,
      otp: params.code,
    });
    const ok = timingSafeEqualHex(expected, actual);

    if (ok) {
      try {
        await ddbDelete({ TableName: params.tableName, Key: { pk, sk } });
      } catch {
        // ignore
      }
      return { ok: true };
    }

    try {
      const attrs = await ddbUpdate<OtpItem>({
        TableName: params.tableName,
        Key: { pk, sk },
        UpdateExpression: "ADD attemptCount :one",
        ExpressionAttributeValues: { ":one": 1 },
        ReturnValues: "ALL_NEW",
      });
      const newAttemptCount = Number(attrs?.attemptCount || 0);
      if (newAttemptCount >= params.maxAttempts) {
        await ddbDelete({ TableName: params.tableName, Key: { pk, sk } });
      }
    } catch {
      // ignore
    }

    return { ok: false, status: 400, error: "Invalid or expired code" };
  },
};
