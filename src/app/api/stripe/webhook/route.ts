import { NextResponse } from "next/server";
import Stripe from "stripe";
import { SendEmailCommand } from "@aws-sdk/client-ses";
import { mustGetEnv } from "@/lib/env";
import { ses } from "@/lib/aws";

export const runtime = "nodejs";

const stripe = new Stripe(mustGetEnv("STRIPE_SECRET_KEY"));

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

async function sendPaymentEmail(params: {
  toEmail: string;
  subject: string;
  textBody: string;
}) {
  await ses().send(
    new SendEmailCommand({
      Source: mustGetEnv("SES_FROM_EMAIL"),
      Destination: { ToAddresses: [params.toEmail] },
      Message: {
        Subject: { Data: params.subject, Charset: "UTF-8" },
        Body: { Text: { Data: params.textBody, Charset: "UTF-8" } },
      },
    })
  );
}

function mustGetPaymentIntentEmail(pi: Stripe.PaymentIntent): string {
  const email = pi.metadata?.email;
  if (!email) throw new Error("Missing PaymentIntent metadata: email");
  return email;
}

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return json(400, { ok: false, error: "Missing signature" });

  const payload = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      payload,
      signature,
      mustGetEnv("STRIPE_WEBHOOK_SECRET")
    );
  } catch {
    return json(400, { ok: false, error: "Invalid signature" });
  }

  if (event.type === "payment_intent.succeeded") {
    const pi = event.data.object as Stripe.PaymentIntent;
    await sendPaymentEmail({
      toEmail: mustGetPaymentIntentEmail(pi),
      subject: "Payment succeeded",
      textBody: `Your payment succeeded.\n\nPaymentIntent: ${pi.id}`,
    });
  }

  return json(200, { ok: true, received: true });
}
