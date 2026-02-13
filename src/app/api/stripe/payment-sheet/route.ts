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

  const monthlyPriceId = mustGetEnv("STRIPE_MONTHLY_PRICE_ID");

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

  const subscription = await stripe.subscriptions.create({
    customer: stripeCustomerId,
    items: [{ price: monthlyPriceId }],
    trial_period_days: 7,
    payment_settings: {
      save_default_payment_method: "on_subscription",
    },
    expand: ["pending_setup_intent"],
    metadata: {
      userId: userEmail.userId,
      email: userEmail.email,
    },
  });

  const pendingSetupIntent = subscription.pending_setup_intent;
  let pendingSetupIntentClientSecret: string | null = null;
  if (pendingSetupIntent) {
    if (typeof pendingSetupIntent === "string") {
      return json(500, {
        ok: false,
        error: "Failed to expand pending setup intent",
      });
    }
    pendingSetupIntentClientSecret = pendingSetupIntent.client_secret;
  }

  return json(200, {
    ok: true,
    subscriptionId: subscription.id,
    subscriptionStatus: subscription.status,
    setupIntentClientSecret: pendingSetupIntentClientSecret,
    pendingSetupIntentClientSecret,
    customerSessionClientSecret: customerSession.client_secret,
    customer: stripeCustomerId,
    publishableKey: mustGetEnv("STRIPE_PUBLIC_KEY"),
  });
}
