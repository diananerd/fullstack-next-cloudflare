import { NextResponse } from 'next/server';
import { getAuthInstance } from "@/modules/auth/utils/auth-utils";
import { headers } from "next/headers";
import Stripe from 'stripe';
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getDb } from "@/db";
import { user as userSchema } from "@/modules/auth/schemas/auth.schema";
import { eq } from "drizzle-orm";

export async function POST(req: Request) {
  try {
     console.log("[API] /api/billing/create-payment-intent called");

     let stripeKey = process.env.STRIPE_SECRET_KEY;
     let env: any = process.env;
     
     // Try to get key from Cloudflare context if available (more reliable in Workers)
     try {
       const ctx = await getCloudflareContext();
       if (ctx && ctx.env) { 
          env = ctx.env;
          if ((ctx.env as any).STRIPE_SECRET_KEY) {
             stripeKey = (ctx.env as any).STRIPE_SECRET_KEY;
          }
       }
     } catch (ctxError) {
       // Ignore error, fallback to process.env
       console.log("[API] Could not retrieve Cloudflare context, using process.env");
     }

     if (!stripeKey) {
       console.error("[API] STRIPE_SECRET_KEY is missing in environment variables");
       return new NextResponse("Server Configuration Error", { status: 500 });
     } else {
        const keyLength = stripeKey.length;
        console.log(`[API] STRIPE_SECRET_KEY loaded (length: ${keyLength})`);
     }

     const stripe = new Stripe(stripeKey, {
        httpClient: Stripe.createFetchHttpClient(),
     });

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

    // 1. Check/Create Stripe Customer
    let customerId = (session.user as any).stripeCustomerId; // Cast because update might not propagate types instantly
    
    if (!customerId) {
        console.log(`[API] User ${session.user.id} has no Stripe Customer ID. Creating one...`);
        try {
            const customer = await stripe.customers.create({
                email: session.user.email,
                name: session.user.name,
                metadata: {
                    userId: session.user.id
                }
            });
            customerId = customer.id;
            
            // Save to DB for future use
            const db = await getDb(env);
            await db.update(userSchema)
                .set({ stripeCustomerId: customerId })
                .where(eq(userSchema.id, session.user.id));
                
            console.log(`[API] Created and saved new Stripe Customer ID: ${customerId}`);
        } catch (e) {
            console.error(`[API] Failed to create Stripe Customer:`, e);
            // Proceed without customer ID if failed
        }
    }

    // Create a PaymentIntent with the order amount and currency
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: "usd",
      customer: customerId || undefined,
      metadata: {
        userId: session.user.id,
        credits: String(amount) // Store anticipated credits in metadata (1:1 rate)
      },
      automatic_payment_methods: {
        enabled: true,
      },
      setup_future_usage: "off_session",
    });

    console.log(`[API] PaymentIntent created successfully. ID=${paymentIntent.id}`);

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
    });
  } catch (error) {
    console.error("[API] create-payment-intent Internal Error:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
