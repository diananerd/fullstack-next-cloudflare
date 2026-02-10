import { NextResponse } from 'next/server';
import { getAuthInstance } from "@/modules/auth/utils/auth-utils";
import { headers } from "next/headers";
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  // Use the default API version (or specify if needed)
});

export async function POST(req: Request) {
  try {
     console.log("[API] /api/billing/create-payment-intent called");
     const auth = await getAuthInstance();
     const session = await auth.api.getSession({
         headers: await headers(),
     });

    if (!session?.user) {
      console.warn("[API] Unauthorized attempt to create payment intent");
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { amount } = (await req.json()) as { amount: number };
    console.log(`[API] Creating payment intent for User=${session.user.id}, Amount=$${amount}`);

    if (!amount || amount < 1) {
        console.warn(`[API] Invalid amount received: ${amount}`);
        return new NextResponse("Invalid amount", { status: 400 });
    }

    // Create a PaymentIntent with the order amount and currency
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: "usd",
      metadata: {
        userId: session.user.id,
        credits: String(amount) // Store anticipated credits in metadata (1:1 rate)
      },
      automatic_payment_methods: {
        enabled: true,
      },
    });

    console.log(`[API] PaymentIntent created successfully. ID=${paymentIntent.id}`);

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
    });
  } catch (error) {
    console.error("[API] create-payment-intent Internal Error:", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
