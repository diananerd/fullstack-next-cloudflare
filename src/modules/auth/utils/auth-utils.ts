/** biome-ignore-all lint/style/noNonNullAssertion: <we will make sure it's not null> */
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { headers } from "next/headers";
import { getDb } from "@/db";
import { CreditService } from "@/modules/credits/services/credit.service";
import type { AuthUser } from "@/modules/auth/models/user.model";
import { eq } from "drizzle-orm";
// Note: sendEmail is imported dynamically to avoid pulling in 'resend' (and its Node/stream dependencies)
// into the Edge runtime until strictly necessary.
// import { sendEmail } from "@/lib/email";
import Stripe from "stripe";
import { user as userSchema } from "@/modules/auth/schemas/auth.schema";

/**
 * Cached auth instance singleton so we don't create a new instance every time
 */
let cachedAuth: ReturnType<typeof betterAuth> | null = null;
let cachedStripe: Stripe | null = null;

/**
 * Initialize Stripe safely for key access
 */
function getStripe(apiKey: string) {
    if (cachedStripe) return cachedStripe;
    cachedStripe = new Stripe(apiKey, {
        httpClient: Stripe.createFetchHttpClient(),
    });
    return cachedStripe;
}

/**
 * Create auth instance dynamically to avoid top-level async issues
 */
async function getAuth() {
    if (cachedAuth) {
        return cachedAuth;
    }

    const context = await getCloudflareContext();
    const env = context.env as any;
    const db = await getDb();

    cachedAuth = betterAuth({
        secret: env.BETTER_AUTH_SECRET,
        baseURL: env.BETTER_AUTH_URL,
        trustedOrigins: [env.BETTER_AUTH_URL],
        database: drizzleAdapter(db, {
            provider: "sqlite",
        }),
        emailAndPassword: {
            enabled: true,
            // @ts-ignore - BetterAuth types might be mismatched, but the runtime behavior passes an object
            async sendResetPassword({ user, url }) {
                console.log(
                    `[Auth] Sending reset password email to ${user.email}`,
                );
                const { sendEmail } = await import("@/lib/email");
                await sendEmail({
                    to: user.email,
                    subject: "Reset your Drimit password",
                    html: `
                        <h1>Reset Password</h1>
                        <p>Hello ${user.name || "User"},</p>
                        <p>Click the link below to reset your password. This link will expire shortly.</p>
                        <p><a href="${url}" style="padding: 10px 20px; background: #000; color: #fff; text-decoration: none; border-radius: 5px;">Reset Password</a></p>
                        <p>Or copy this link: ${url}</p>
                    `,
                    env,
                });
            },
            // @ts-ignore - BetterAuth types might be mismatched, but the runtime behavior passes an object
            async sendVerificationEmail({ user, url }) {
                console.log(
                    `[Auth] Sending verification email to ${user.email}`,
                );
                const { sendEmail } = await import("@/lib/email");
                await sendEmail({
                    to: user.email,
                    subject: "Verify your Drimit email",
                    html: `
                        <h1>Verify Email</h1>
                        <p>Hello ${user.name || "User"},</p>
                        <p>Click the link below to verify your email address.</p>
                        <p><a href="${url}" style="padding: 10px 20px; background: #000; color: #fff; text-decoration: none; border-radius: 5px;">Verify Email</a></p>
                        <p>Or copy this link: ${url}</p>
                    `,
                    env,
                });
            },
        },
        socialProviders: {
            google: {
                enabled: true,
                clientId: env.GOOGLE_CLIENT_ID!,
                clientSecret: env.GOOGLE_CLIENT_SECRET!,
            },
        },
        user: {
            deleteUser: {
                enabled: true,
            },
            additionalFields: {
                credits: {
                    type: "number",
                    defaultValue: 0,
                },
            },
        },
        databaseHooks: {
            user: {
                create: {
                    after: async (user) => {
                        console.log(
                            `[AuthHook] 🟢 User Created Loop Triggered. Full User Object:`,
                            JSON.stringify(user, null, 2),
                        );
                        
                        // --- Stripe Customer Creation ---
                        try {
                            // Cast env to any to avoid CloudflareEnv type errors if STRIPE_SECRET_KEY is missing from types
                            const safeEnv = env as any;
                            if (safeEnv.STRIPE_SECRET_KEY && !user.stripeCustomerId) {
                                console.log(`[AuthHook] Creating Stripe Customer for ${user.email}`);
                                const stripe = getStripe(safeEnv.STRIPE_SECRET_KEY);
                                const customer = await stripe.customers.create({
                                    email: user.email,
                                    name: user.name,
                                    metadata: {
                                        userId: user.id
                                    }
                                });
                                
                                console.log(`[AuthHook] Stripe Customer created: ${customer.id}. Updating user...`);
                                
                                // Update user with Stripe Customer ID
                                await db.update(userSchema)
                                    .set({ stripeCustomerId: customer.id })
                                    .where(eq(userSchema.id, user.id));
                            }
                        } catch (err) {
                            console.error(`[AuthHook] Failed to create Stripe Customer for ${user.id}:`, err);
                            // Ensure signup continues even if Stripe creation fails
                        }

                        try {
                            // Verify user object structure
                            if (!user.id) {
                                console.error(
                                    "[AuthHook] 🔴 User object missing ID. Aborting bonus.",
                                );
                                return;
                            }

                            console.log(
                                `[AuthHook] Attempting to award 5.00 credits to ${user.id}...`,
                            );

                            // Check explicit balance before
                            const currentBalance =
                                await CreditService.getBalance(user.id);
                            console.log(
                                `[AuthHook] Current balance before bonus: ${currentBalance}`,
                            );

                            // Dynamically import to ensure fresh instance if needed, though top-level is fine usually
                            // But cleaner stack trace if we separate it.
                            const newBalance = await CreditService.addCredits(
                                user.id,
                                5.0,
                                "BONUS",
                                "Welcome Bonus (New Account)",
                                {
                                    trigger: "user.create",
                                    timestamp: new Date().toISOString(),
                                },
                            );
                            console.log(
                                `[AuthHook] ✅ Welcome bonus successfully awarded to ${user.id}. New Balance: ${newBalance}`,
                            );
                        } catch (error) {
                            console.error(
                                `[AuthHook] 🔴 Failed to award welcome bonus:`,
                                error,
                            );
                            // In a real prod environment, we might push to a dead-letter queue here
                        }
                    },
                },
                delete: {
                    before: async (user: any) => {
                        console.log(
                            `[AuthHook] Deleting user ${user.email} (${user.id})...`,
                        );
                        try {
                            // Check for stripeCustomerId (using 'any' cast if type definition isn't updated in this scope's context yet, 
                            // though we updated schema so it should be fine if types are regenerated/inferred)
                            const customerId = (user as any).stripeCustomerId;
                            
                            if (env.STRIPE_SECRET_KEY && customerId) {
                                console.log(
                                    `[AuthHook] Deleting Stripe Customer ${customerId}...`,
                                );
                                const stripe = getStripe(env.STRIPE_SECRET_KEY);
                                await stripe.customers.del(customerId);
                                console.log(
                                    `[AuthHook] Stripe Customer deleted.`,
                                );
                            }
                        } catch (err) {
                            console.error(
                                `[AuthHook] Failed to delete Stripe Customer:`,
                                err,
                            );
                            // Don't block deletion of user
                        }
                    },
                },
            },
        },
        plugins: [nextCookies()],
    });

    return cachedAuth;
}
/**
 * Get the current authenticated user from the session
 * Returns null if no user is authenticated
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
    try {
        const auth = await getAuth();
        const session = await auth.api.getSession({
            headers: await headers(),
        });

        if (!session?.user) {
            return null;
        }

        return {
            id: session.user.id,
            name: session.user.name,
            email: session.user.email,
            image: session.user.image,
        };
    } catch (error) {
        console.error("Error getting current user:", error);
        return null;
    }
}

/**
 * Get the current authenticated user or throw an error
 * Use this when authentication is required
 */
export async function requireAuth(): Promise<AuthUser> {
    const user = await getCurrentUser();

    if (!user) {
        throw new Error("Authentication required");
    }

    return user;
}

/**
 * Check if a user is authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
    const user = await getCurrentUser();
    return user !== null;
}

/**
 * Get the auth instance for use in server actions and API routes
 */
export async function getAuthInstance() {
    return await getAuth();
}

/**
 * Get session information
 */
export async function getSession() {
    try {
        const auth = await getAuth();
        return await auth.api.getSession({
            headers: await headers(),
        });
    } catch (error) {
        console.error("Error getting session:", error);
        return null;
    }
}
