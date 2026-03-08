/** biome-ignore-all lint/style/noNonNullAssertion: <we will make sure it's not null> */
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { organization as organizationPlugin } from "better-auth/plugins";
import { headers } from "next/headers";
import { getDb } from "@/db";
import { CreditService } from "@/modules/credits/services/credit.service";
import type { AuthUser } from "@/modules/auth/models/user.model";
import { and, eq, ne } from "drizzle-orm";
// Note: sendEmail is imported dynamically to avoid pulling in 'resend' (and its Node/stream dependencies)
// into the Edge runtime until strictly necessary.
// import { sendEmail } from "@/lib/email";
import Stripe from "stripe";
import {
    user as userSchema,
    session as sessionSchema,
    account as accountSchema,
    verification as verificationSchema,
} from "@/modules/auth/schemas/auth.schema";
import {
    organization as organizationSchema,
    member as memberSchema,
    invitation as invitationSchema,
} from "@/modules/profiles/schemas/org-plugin.schema";
import { nodes as nodesSchema } from "@/modules/nodes/schemas/node.schema";
import { profileNodes as profileNodesSchema } from "@/modules/profiles/schemas/profile-node.schema";
import { collectionNodes as collectionNodesSchema } from "@/modules/artworks/schemas/collection-node.schema";
import { commissions as commissionsSchema } from "@/modules/commissions/schemas/commission.schema";
import { creditEscrow as creditEscrowSchema } from "@/modules/credits/schemas/credit-escrow.schema";
import { deleteFolderFromR2 } from "@/lib/r2";

/**
 * Cached auth instance singleton so we don't create a new instance every time
 */
let cachedAuth: ReturnType<typeof betterAuth> | null = null;

/** Derive a URL-safe slug from a display name or email prefix */
function deriveBaseSlug(name: string, email: string): string {
    const source = name?.trim() || email.split("@")[0];
    const slug = source
        .normalize("NFKD")
        .replace(/\p{Mn}/gu, "") // strip combining marks (accents)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 30)
        .replace(/-+$/, "");
    return slug || "user";
}

/** Return the first available slug.
 *  Tries base → base-2 … base-9 → user_{random6} as final fallback. */
async function findUniqueSlug(
    db: Awaited<ReturnType<typeof import("@/db").getDb>>,
    baseSlug: string,
): Promise<string> {
    const candidates = [
        baseSlug,
        ...Array.from({ length: 8 }, (_, i) => `${baseSlug}-${i + 2}`),
    ];
    for (const slug of candidates) {
        const [existing] = await db
            .select({ id: organizationSchema.id })
            .from(organizationSchema)
            .where(eq(organizationSchema.slug, slug))
            .limit(1);
        if (!existing) return slug;
    }
    // Final fallback: user_ + 6 random alphanumeric chars
    const rand = Math.random().toString(36).slice(2, 8);
    return `user-${rand}`;
}
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
            schema: {
                user: userSchema,
                session: sessionSchema,
                account: accountSchema,
                verification: verificationSchema,
                organization: organizationSchema,
                member: memberSchema,
                invitation: invitationSchema,
            },
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
                onboardedAt: {
                    type: "string",
                    input: false,
                    required: false,
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
                            if (
                                safeEnv.STRIPE_SECRET_KEY &&
                                !user.stripeCustomerId
                            ) {
                                console.log(
                                    `[AuthHook] Creating Stripe Customer for ${user.email}`,
                                );
                                const stripe = getStripe(
                                    safeEnv.STRIPE_SECRET_KEY,
                                );
                                const customer = await stripe.customers.create({
                                    email: user.email,
                                    name: user.name,
                                    metadata: {
                                        userId: user.id,
                                    },
                                });

                                console.log(
                                    `[AuthHook] Stripe Customer created: ${customer.id}. Updating user...`,
                                );

                                // Update user with Stripe Customer ID
                                await db
                                    .update(userSchema)
                                    .set({ stripeCustomerId: customer.id })
                                    .where(eq(userSchema.id, user.id));
                            }
                        } catch (err) {
                            console.error(
                                `[AuthHook] Failed to create Stripe Customer for ${user.id}:`,
                                err,
                            );
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
                        }

                        // --- Auto-create profile (organization) ---
                        try {
                            const baseSlug = deriveBaseSlug(
                                (user as any).name ?? "",
                                user.email,
                            );
                            const slug = await findUniqueSlug(db, baseSlug);
                            const orgId = crypto.randomUUID();

                            await db.insert(organizationSchema).values({
                                id: orgId,
                                name: (user as any).name?.trim() || slug,
                                slug,
                                createdAt: new Date(),
                            });

                            await db.insert(memberSchema).values({
                                id: crypto.randomUUID(),
                                organizationId: orgId,
                                userId: user.id,
                                role: "owner",
                                createdAt: new Date(),
                            });

                            // Create the graph node for this profile
                            await db.insert(nodesSchema).values({
                                id: orgId,
                                type: "profile",
                                createdBy: user.id,
                                visibility: "public",
                            });
                            await db.insert(profileNodesSchema).values({
                                id: orgId,
                                orgId,
                            });

                            // Auto-create "Favorites" board for every new user
                            const favoritesId = crypto.randomUUID();
                            await db.insert(nodesSchema).values({
                                id: favoritesId,
                                type: "collection",
                                createdBy: user.id,
                                visibility: "private",
                            });
                            await db.insert(collectionNodesSchema).values({
                                id: favoritesId,
                                name: "Favorites",
                                itemCount: 0,
                            });

                            console.log(
                                `[AuthHook] ✅ Profile created: @${slug} (org ${orgId}) for user ${user.id}`,
                            );
                        } catch (error) {
                            console.error(
                                `[AuthHook] 🔴 Failed to create profile:`,
                                error,
                            );
                        }
                    },
                },
                delete: {
                    before: async (user: any) => {
                        const userId: string = user.id;
                        console.log(
                            `[AuthHook] Deleting user ${user.email} (${userId})`,
                        );

                        // 1. R2 — wipe entire user directory (original + protected + verification files)
                        try {
                            await deleteFolderFromR2(`${userId}/`, env as any);
                            console.log(
                                `[AuthHook] R2 data deleted for ${userId}`,
                            );
                        } catch (err) {
                            console.error(
                                `[AuthHook] Failed to delete R2 data:`,
                                err,
                            );
                        }

                        // 2. Stripe Customer
                        try {
                            const safeEnv = env as any;
                            const customerId = user.stripeCustomerId;
                            if (safeEnv.STRIPE_SECRET_KEY && customerId) {
                                const stripe = getStripe(
                                    safeEnv.STRIPE_SECRET_KEY,
                                );
                                await stripe.customers.del(customerId);
                                console.log(
                                    `[AuthHook] Stripe Customer deleted`,
                                );
                            }
                        } catch (err) {
                            console.error(
                                `[AuthHook] Failed to delete Stripe Customer:`,
                                err,
                            );
                        }

                        // 3. Credit escrow (RESTRICT FK on fromUserId + toUserId)
                        try {
                            await db
                                .delete(creditEscrowSchema)
                                .where(
                                    eq(creditEscrowSchema.fromUserId, userId),
                                );
                            await db
                                .delete(creditEscrowSchema)
                                .where(eq(creditEscrowSchema.toUserId, userId));
                        } catch (err) {
                            console.error(
                                `[AuthHook] Failed to delete credit escrow:`,
                                err,
                            );
                        }

                        // 4. Commissions as client (RESTRICT FK — cascade handles milestones/payments/messages)
                        try {
                            await db
                                .delete(commissionsSchema)
                                .where(
                                    eq(commissionsSchema.clientUserId, userId),
                                );
                        } catch (err) {
                            console.error(
                                `[AuthHook] Failed to delete commissions:`,
                                err,
                            );
                        }

                        // 5. Collections/artworks created by user now cascade via nodes.created_by FK.

                        // 6. Sole-owned orgs (cascade handles members, invitations)
                        try {
                            const ownedOrgs = await db
                                .select({ id: memberSchema.organizationId })
                                .from(memberSchema)
                                .where(
                                    and(
                                        eq(memberSchema.userId, userId),
                                        eq(memberSchema.role, "owner"),
                                    ),
                                );

                            for (const { id: orgId } of ownedOrgs) {
                                const [otherMember] = await db
                                    .select({ id: memberSchema.id })
                                    .from(memberSchema)
                                    .where(
                                        and(
                                            eq(
                                                memberSchema.organizationId,
                                                orgId,
                                            ),
                                            ne(memberSchema.userId, userId),
                                        ),
                                    )
                                    .limit(1);

                                if (!otherMember) {
                                    await db
                                        .delete(organizationSchema)
                                        .where(
                                            eq(organizationSchema.id, orgId),
                                        );
                                    console.log(
                                        `[AuthHook] Deleted sole-owned org ${orgId}`,
                                    );
                                }
                            }
                        } catch (err) {
                            console.error(
                                `[AuthHook] Failed to delete orgs:`,
                                err,
                            );
                        }

                        // nodes (artworks, collections, profiles), node_relations,
                        // creditTransactions, member (org), account, session
                        // → all CASCADE on user delete
                    },
                },
            },
            session: {
                create: {
                    after: async (session) => {
                        // Set activeOrganizationId on first session if not already set
                        if ((session as any).activeOrganizationId) return;
                        try {
                            const [membership] = await db
                                .select({
                                    organizationId: memberSchema.organizationId,
                                })
                                .from(memberSchema)
                                .where(eq(memberSchema.userId, session.userId))
                                .limit(1);
                            if (membership) {
                                await db
                                    .update(sessionSchema)
                                    .set({
                                        activeOrganizationId:
                                            membership.organizationId,
                                    })
                                    .where(eq(sessionSchema.id, session.id));
                            }
                        } catch (err) {
                            console.error(
                                "[AuthHook] Failed to set activeOrganizationId:",
                                err,
                            );
                        }
                    },
                },
            },
        },
        plugins: [
            nextCookies(),
            organizationPlugin({
                creatorRole: "owner",
                allowUserToCreateOrganization: true,
                invitationExpiresIn: 60 * 60 * 24 * 7, // 7 days
                schema: {
                    organization: {
                        additionalFields: {
                            profileType: {
                                type: "string",
                                input: true,
                                required: false,
                                defaultValue: "individual",
                            },
                            bio: {
                                type: "string",
                                input: true,
                                required: false,
                            },
                            websiteUrl: {
                                type: "string",
                                input: true,
                                required: false,
                            },
                            visibility: {
                                type: "string",
                                input: true,
                                required: false,
                                defaultValue: "public",
                            },
                            stripeConnectId: {
                                type: "string",
                                input: false,
                                required: false,
                            },
                            stripeConnectStatus: {
                                type: "string",
                                input: false,
                                required: false,
                            },
                        },
                    },
                },
            }),
        ],
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

        const userId = session.user.id;
        let profileSlug: string | undefined;
        try {
            const db = await getDb();
            const [org] = await db
                .select({ slug: organizationSchema.slug })
                .from(organizationSchema)
                .innerJoin(
                    memberSchema,
                    and(
                        eq(memberSchema.organizationId, organizationSchema.id),
                        eq(memberSchema.userId, userId),
                        eq(memberSchema.role, "owner"),
                    ),
                )
                .limit(1);
            profileSlug = org?.slug;
        } catch {
            // non-fatal — slug is optional
        }

        return {
            id: userId,
            name: session.user.name,
            email: session.user.email,
            image: session.user.image,
            profileSlug,
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
