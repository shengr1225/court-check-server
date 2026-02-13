import { NextResponse } from "next/server";
import { mustGetEnv } from "@/lib/env";
import { isProbablyValidEmail } from "@/lib/otp";
import { authCookie, createAuthToken } from "@/lib/auth";
import { UserService } from "@/services/UserService";
import { OtpService } from "@/services/OtpService";

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
  const otpRes = await OtpService.verifyAndConsumeOtp({
    tableName,
    email,
    otpSecret,
    code,
    maxAttempts,
  });

  if (!otpRes.ok) {
    return json(otpRes.status, { ok: false, error: otpRes.error });
  }

  const userEmail = await UserService.getUserEmailByEmail({ tableName, email });

  if (userEmail) {
    const userProfile = await UserService.getUserProfileByUserId({
      tableName,
      userId: userEmail.userId,
    });
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
          checkinCount: userProfile.checkinCount,
          stripeCustomerId: userProfile.stripeCustomerId,
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
    name && name.length > 0 && name.length <= 256 ? name : email.split("@")[0];

  try {
    const userId = UserService.generateUserId();
    const { userProfile } = await UserService.createUser({
      tableName,
      userId,
      email,
      name: userName,
    });
    console.log("[otp/verify] user_created", { userId });
    const res = NextResponse.json(
      {
        ok: true,
        user: {
          userId,
          email,
          name: userProfile.name,
          checkinCount: userProfile.checkinCount,
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
      const existingUserEmail = await UserService.getUserEmailByEmail({
        tableName,
        email,
      });
      if (existingUserEmail) {
        const existingUserProfile = await UserService.getUserProfileByUserId({
          tableName,
          userId: existingUserEmail.userId,
        });
        if (existingUserProfile) {
          const res = NextResponse.json(
            {
              ok: true,
              user: {
                userId: existingUserEmail.userId,
                email: existingUserEmail.email,
                name: existingUserProfile.name,
                checkinCount: existingUserProfile.checkinCount,
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
