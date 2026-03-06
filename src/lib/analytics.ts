/**
 * Server-side analytics for Drimit.
 *
 * Uses direct fetch to PostHog batch API — fully compatible with
 * Cloudflare Workers Edge runtime (no posthog-node needed).
 *
 * Analytics must never break the main flow: all calls are fire-and-forget
 * and swallow errors silently.
 *
 * Event taxonomy: see CLAUDE.md § PostHog
 */

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST =
    process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.posthog.com";

async function capture(
    distinctId: string,
    event: string,
    properties?: Record<string, unknown>,
) {
    if (!POSTHOG_KEY || !distinctId) return;
    try {
        await fetch(`${POSTHOG_HOST}/batch/`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                api_key: POSTHOG_KEY,
                batch: [
                    {
                        type: "capture",
                        event,
                        distinct_id: distinctId,
                        timestamp: new Date().toISOString(),
                        properties: {
                            $lib: "posthog-node",
                            environment: process.env.NODE_ENV,
                            ...properties,
                        },
                    },
                ],
            }),
        });
    } catch {
        // Swallowed intentionally — analytics must never break user flows
    }
}

// ─── Typed Event Helpers ──────────────────────────────────────────────────────

export const Analytics = {
    // ── Artwork funnel ────────────────────────────────────────────────────────
    artworkUploaded: (
        userId: string,
        props: { artwork_id: number; size_bytes: number; mime_type: string },
    ) => capture(userId, "artwork_uploaded", props),

    protectionStarted: (
        userId: string,
        props: {
            artwork_id: number;
            layers: string[];
            intensity: string;
            cost_credits: number;
        },
    ) => capture(userId, "protection_started", props),

    protectionCompleted: (
        userId: string,
        props: {
            artwork_id: number;
            shield_score?: number;
            duration_ms?: number;
            layers_passed: number;
            layers_failed: number;
        },
    ) => capture(userId, "protection_completed", props),

    protectionFailed: (
        userId: string,
        props: { artwork_id: number; error: string },
    ) => capture(userId, "protection_failed", props),

    // ── Credits ───────────────────────────────────────────────────────────────
    creditsInsufficient: (
        userId: string,
        props: { balance: number; required: number; missing: number },
    ) => capture(userId, "credits_insufficient", props),

    // ── Error tracking ────────────────────────────────────────────────────────
    // Sends to PostHog's $exception event — shows up in the Error Tracking tab.
    captureException: (
        distinctId: string,
        error: unknown,
        context?: Record<string, unknown>,
    ) => {
        const err = error instanceof Error ? error : new Error(String(error));
        return capture(distinctId, "$exception", {
            $exception_message: err.message,
            $exception_type: err.name ?? "Error",
            $exception_stack_trace_raw: err.stack,
            $exception_is_synthetic: false,
            ...context,
        });
    },
};

// ─── Feature Flag Evaluation (server-side) ────────────────────────────────────
// Uses PostHog's /decide endpoint — compatible with Cloudflare Workers.
// For client-side, use `useFeatureFlag` from posthog-js/react instead.
//
// Usage: const enabled = await getFeatureFlag(user.id, "new-dashboard-v2")
//
export async function getFeatureFlag(
    distinctId: string,
    flagKey: string,
): Promise<boolean | string | undefined> {
    if (!POSTHOG_KEY || !distinctId) return undefined;
    try {
        const res = await fetch(`${POSTHOG_HOST}/decide/?v=3`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                api_key: POSTHOG_KEY,
                distinct_id: distinctId,
            }),
        });
        const data = (await res.json()) as {
            featureFlags?: Record<string, boolean | string>;
        };
        return data.featureFlags?.[flagKey];
    } catch {
        return undefined;
    }
}
