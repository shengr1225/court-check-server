import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { mustGetEnv } from "@/lib/env";
import { authCookie, verifyAuthToken } from "@/lib/auth";
import { UserService } from "@/services/UserService";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

const stripe = new Stripe(mustGetEnv("STRIPE_SECRET_KEY"));

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ customId: string }> }
) {
  const token = request.cookies.get(authCookie.name)?.value;
  if (!token) return json(401, { ok: false, error: "Unauthorized" });

  const payload = await verifyAuthToken(token);
  if (!payload) return json(401, { ok: false, error: "Unauthorized" });

  const { customId } = await ctx.params;
  const tableName = mustGetEnv("DYNAMODB_TABLE");

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

  if (!userProfile.stripeCustomerId) {
    return json(404, { ok: false, error: "Stripe customer not found" });
  }
  if (userProfile.stripeCustomerId !== customId) {
    return json(403, { ok: false, error: "Forbidden" });
  }

  const subscriptions = await stripe.subscriptions.list({
    customer: customId,
    status: "all",
    limit: 1,
  });
  const subscription = subscriptions.data[0];

  if (!subscription) return json(200, { ok: true, subscription: null });
  const subscriptionItem = subscription.items.data[0];
  if (!subscriptionItem) {
    return json(500, { ok: false, error: "Subscription item not found" });
  }

  return json(200, {
    ok: true,
    subscription: {
      id: subscription.id,
      status: subscription.status,
      trialEnd: subscription.trial_end,
      currentPeriodEnd: subscriptionItem.current_period_end,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      customer: customId,
    },
  });
}
