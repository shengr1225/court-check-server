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

function mustGetInvoiceEmail(invoice: Stripe.Invoice): string {
  const email = invoice.customer_email;
  if (!email) throw new Error("Missing invoice customer_email");
  return email;
}

async function mustGetSubscriptionEmail(
  subscription: Stripe.Subscription
): Promise<string> {
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;
  const customer = await stripe.customers.retrieve(customerId);
  if ("deleted" in customer && customer.deleted) {
    throw new Error("Customer deleted");
  }
  if (!customer.email) {
    throw new Error("Customer email missing");
  }
  return customer.email;
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

  if (event.type === "invoice.payment_succeeded") {
    const invoice = event.data.object as Stripe.Invoice;
    await sendPaymentEmail({
      toEmail: mustGetInvoiceEmail(invoice),
      subject: "Subscription payment succeeded",
      textBody: `Your subscription payment succeeded.\n\nInvoice: ${invoice.id}`,
    });
  }

  if (event.type === "invoice.payment_failed") {
    const invoice = event.data.object as Stripe.Invoice;
    await sendPaymentEmail({
      toEmail: mustGetInvoiceEmail(invoice),
      subject: "Subscription payment failed",
      textBody: `Your subscription payment failed.\n\nInvoice: ${invoice.id}`,
    });
  }

  if (event.type === "customer.subscription.updated") {
    const subscription = event.data.object as Stripe.Subscription;
    await sendPaymentEmail({
      toEmail: await mustGetSubscriptionEmail(subscription),
      subject: "Subscription updated",
      textBody: `Your subscription status is now ${subscription.status}.\n\nSubscription: ${subscription.id}`,
    });
  }

  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;
    await sendPaymentEmail({
      toEmail: await mustGetSubscriptionEmail(subscription),
      subject: "Subscription canceled",
      textBody: `Your subscription has been canceled.\n\nSubscription: ${subscription.id}`,
    });
  }

  return json(200, { ok: true, received: true });
}
