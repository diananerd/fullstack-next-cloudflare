import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { CreditService } from "@/modules/credits/services/credit.service";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function GET(req: Request) {
    let env: any = process.env;
    try {
        const context = await getCloudflareContext();
        if (context?.env) env = context.env;
    } catch {}
    
    return NextResponse.json({
        status: "alive",
        hasStripeKey: !!env.STRIPE_SECRET_KEY,
        hasWebhookSecret: !!env.STRIPE_WEBHOOK_SECRET
    });
}

export async function POST(req: Request) {
  const body = await req.text();
  const signature = (await headers()).get("stripe-signature");

  console.log("[Webhook] Received Stripe Webhook");

  let env: any = process.env;
  try {
      const context = await getCloudflareContext();
      if (context?.env) {
          env = context.env;
      }
  } catch (e) {
      console.warn("[Webhook] Failed to get Cloudflare context, using process.env");
  }

  const stripeKey = env.STRIPE_SECRET_KEY as string;
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET as string;

  if (!stripeKey) {
     console.error("[Webhook] STRIPE_SECRET_KEY is missing");
     return new NextResponse("Server Configuration Error", { status: 500 });
  }

  // Initialize Stripe client locally
  // We specify the API version if possible to match the "Account V2" / Events V2 expectations if needed,
  // though the SDK version usually dictates the types.
  const stripe = new Stripe(stripeKey, {
    httpClient: Stripe.createFetchHttpClient(),
  });
  
  if (!webhookSecret) {
     console.error("[Webhook] STRIPE_WEBHOOK_SECRET is missing");
     return new NextResponse("Server Configuration Error", { status: 500 });
  } else {
      console.log(`[Webhook] STRIPE_WEBHOOK_SECRET present (length: ${webhookSecret.length})`);
  }

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
  if ((event.type as string) === "v2.core.event_destination.ping") {
    console.log("[Webhook] 📡 Received Stripe V2 Ping. Connection verified.");
  } else if (event.type === "payment_intent.succeeded" || (event.type as string).endsWith(".payment_intent.succeeded")) {
    // Handle V1 and standard payment success
    // Note: If using V2 Events, they might be "Thin" (missing data). We should fetch if needed.
    
    let paymentIntent: Stripe.PaymentIntent;
    
    // Check if it's a "Thin" event (V2 style) or standard
    if (event.object.startsWith("v2.")) {
       const relatedObject = (event as any).related_object;
       if (relatedObject?.id && relatedObject?.type === "payment_intent") {
           console.log(`[Webhook] 🔄 Fetching full PaymentIntent from Thin Event: ${relatedObject.id}`);
           paymentIntent = await stripe.paymentIntents.retrieve(relatedObject.id);
       } else {
           console.warn("[Webhook] ⚠️ V2 Event received but could not resolve PaymentIntent ID.");
           return new NextResponse("Unhandled V2 Event Structure", { status: 400 });
       }
    } else {
       // Standard V1 Event
       paymentIntent = event.data.object as Stripe.PaymentIntent;
    }
    
    // Recuperar datos guardados al crear el intento de pago
    const userId = paymentIntent.metadata?.userId;
    const creditsAmount = parseInt(paymentIntent.metadata?.credits || "0");

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
                },
                paymentIntent.id // referenceId
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
