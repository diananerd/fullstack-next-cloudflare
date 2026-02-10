import { NextResponse } from 'next/server';
import { getAuthInstance } from "@/modules/auth/utils/auth-utils";
import { headers } from "next/headers";
import Stripe from 'stripe';
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { CreditService } from "@/modules/credits/services/credit.service";

export async function POST(req: Request) {
  try {
     console.log("[API] /api/billing/verify-payment called");
     
     let stripeKey = process.env.STRIPE_SECRET_KEY;
     // Try to get key from Cloudflare context if available
     try {
       const ctx = await getCloudflareContext();
       if (ctx && ctx.env && (ctx.env as any).STRIPE_SECRET_KEY) { 
          stripeKey = (ctx.env as any).STRIPE_SECRET_KEY;
       }
     } catch {}

     if (!stripeKey) {
       console.error("[API] STRIPE_SECRET_KEY missing");
       return new NextResponse("Server Configuration Error", { status: 500 });
     }

     const auth = await getAuthInstance();
     const session = await auth.api.getSession({
         headers: await headers(),
     });

    if (!session?.user) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { paymentIntentId } = (await req.json()) as { paymentIntentId: string };
    
    if (!paymentIntentId) {
        return new NextResponse("Missing PaymentIntent ID", { status: 400 });
    }

    // 1. Check if we already processed this
    // We can't easily check 'CreditService' without full DB access, but `addCredits` now handles idempotency.
    // However, it's safer to check first if we can, or let `addCredits` handle it and trust it returns current balance.
    // The `addCredits` logic I added returns the current balance if it exists. So we are good.

    // 2. Fetch Payment Intent from Stripe to verify status
     const stripe = new Stripe(stripeKey, {
        httpClient: Stripe.createFetchHttpClient(),
     });

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status !== 'succeeded') {
        return new NextResponse(`Payment not successful (Status: ${paymentIntent.status})`, { status: 400 });
    }

    // Verify ownership
    if (paymentIntent.metadata.userId !== session.user.id) {
         console.warn(`[Verification] User ${session.user.id} tried to verify payment ${paymentIntent.id} belonging to ${paymentIntent.metadata.userId}`);
         return new NextResponse("Unauthorized Payment Access", { status: 403 });
    }

    const creditsAmount = parseInt(paymentIntent.metadata.credits || "0");
    
    if (creditsAmount > 0) {
        console.log(`[Verification] Verifying and Adding ${creditsAmount} credits for user ${session.user.id}`);
        
        await CreditService.addCredits(
            session.user.id, 
            creditsAmount, 
            "DEPOSIT", 
            `Purchase via Stripe (${paymentIntent.id})`,
            {
                stripePaymentId: paymentIntent.id,
                amountPaidCent: paymentIntent.amount,
                currency: paymentIntent.currency,
                method: "ManualVerification"
            },
            paymentIntent.id // referenceId for Idempotency
        );
    }

    return NextResponse.json({ success: true, credits: creditsAmount });

  } catch (error: any) {
      console.error("[API] Verification failed:", error);
      return new NextResponse(error.message || "Internal Error", { status: 500 });
  }
}
