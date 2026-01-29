import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { mustGetEnv } from "@/lib/env";
import { authCookie, verifyAuthToken } from "@/lib/auth";
import { UserService } from "@/services/UserService";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

const stripe = new Stripe(mustGetEnv("STRIPE_SECRET_KEY"));

export async function POST(request: NextRequest) {
  const token = request.cookies.get(authCookie.name)?.value;
  if (!token) return json(401, { ok: false, error: "Unauthorized" });

  const payload = await verifyAuthToken(token);
  if (!payload) return json(401, { ok: false, error: "Unauthorized" });

  const tableName = mustGetEnv("DYNAMODB_TABLE");

  const amountCents = Number(mustGetEnv("STRIPE_AMOUNT_CENTS"));
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return json(500, {
      ok: false,
      error: "Bad server config: STRIPE_AMOUNT_CENTS",
    });
  }

  const userEmail = await UserService.getUserEmailByEmail({
    tableName,
    email: payload.email,
  });
  if (!userEmail) return json(401, { ok: false, error: "Unauthorized" });

  const userProfile = await UserService.getUserProfileByUserId({
    tableName,
    userId: userEmail.userId,
  });
  if (!userProfile)
    return json(500, { ok: false, error: "User profile not found" });

  let stripeCustomerId = userProfile.stripeCustomerId;
  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      email: userEmail.email,
      metadata: {
        userId: userEmail.userId,
      },
    });
    stripeCustomerId = customer.id;
    await UserService.setStripeCustomerId({
      tableName,
      userId: userEmail.userId,
      stripeCustomerId,
    });
  }

  const customerSession = await stripe.customerSessions.create({
    customer: stripeCustomerId,
    components: {
      mobile_payment_element: {
        enabled: true,
        features: {
          payment_method_save: "enabled",
          payment_method_redisplay: "enabled",
          payment_method_remove: "enabled",
        },
      },
    },
  });

  const paymentIntent = await stripe.paymentIntents.create({
    amount: amountCents,
    currency: "usd",
    customer: stripeCustomerId,
    metadata: {
      userId: userEmail.userId,
      email: userEmail.email,
    },
    automatic_payment_methods: { enabled: true },
  });

  return json(200, {
    ok: true,
    paymentIntent: paymentIntent.client_secret,
    customerSessionClientSecret: customerSession.client_secret,
    customer: stripeCustomerId,
    publishableKey: mustGetEnv("STRIPE_PUBLIC_KEY"),
  });
}
