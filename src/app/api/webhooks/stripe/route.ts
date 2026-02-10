import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { CreditService } from "@/modules/credits/services/credit.service";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  // Use default API version
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

export async function POST(req: Request) {
  const body = await req.text();
  const signature = (await headers()).get("stripe-signature");

  console.log("[Webhook] Received Stripe Webhook");

  let event: Stripe.Event;

  try {
    if (!signature || !webhookSecret) {
         // Validar que tengamos el secreto para verificar la firma
         console.error("[Webhook] Missing stripe signature or webhook secret");
         return new NextResponse("Webhook Error", { status: 400 });
    }

    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    console.log(`[Webhook] Event Verified: ${event.type} (ID: ${event.id})`);
  } catch (err: any) {
    console.error(`[Webhook] ⚠️  Signature verification failed.`, err.message);
    return new NextResponse(`Webhook Error: ${err.message}`, { status: 400 });
  }

  // Handle the event
  if (event.type === "payment_intent.succeeded") {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    
    // Recuperar datos guardados al crear el intento de pago
    const userId = paymentIntent.metadata.userId;
    const creditsAmount = parseInt(paymentIntent.metadata.credits || "0");

    console.log(`[Webhook] Processing PaymentIntent ${paymentIntent.id} for User ${userId}, Credits: ${creditsAmount}`);

    if (userId && creditsAmount > 0) {
        try {
            console.log(`[Webhook] 💰 Adding ${creditsAmount} credits to user ${userId}...`);
            
            await CreditService.addCredits(
                userId, 
                creditsAmount, 
                "DEPOSIT", 
                `Purchase via Stripe (${paymentIntent.id})`,
                {
                    stripePaymentId: paymentIntent.id,
                    amountPaidCent: paymentIntent.amount,
                    currency: paymentIntent.currency
                }
            );
            
            console.log("[Webhook] ✅ Credits added successfully.");
        } catch (error) {
            console.error("[Webhook] ❌ Failed to add credits:", error);
            // Devolver 500 hace que Stripe reintente más tarde
            return new NextResponse("Internal Server Error", { status: 500 });
        }
    } else {
        console.warn("[Webhook] ⚠️ PaymentIntent missing metadata (userId or credits). Skipping credit addition.");
    }
  } else {
     console.log(`[Webhook] Unhandled event type: ${event.type}`);
  }

  return new NextResponse("OK", { status: 200 });
}
