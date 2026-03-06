/**
 * Feature flag helpers for Drimit.
 *
 * Server-side: `getFeatureFlag(userId, flagKey)` — via analytics.ts /decide
 * Client-side: `useFeatureFlagEnabled(flagKey)` — re-exported from posthog-js/react
 *
 * Flags are created and managed in the PostHog dashboard.
 * They drive gradual rollouts, A/B tests, and kill switches.
 *
 * Known flags (add as you create them in PostHog):
 * ─────────────────────────────────────────────────────
 * (none yet — add here as you create them in PostHog)
 *
 * Usage examples:
 *
 *   // Server action
 *   const showBeta = await getFeatureFlag(user.id, "beta-pipeline-v3")
 *   if (showBeta) { ... }
 *
 *   // Client component
 *   const showBeta = useFeatureFlagEnabled("beta-pipeline-v3")
 *   if (showBeta) { ... }
 */

export { getFeatureFlag } from "@/lib/analytics";
export {
    useFeatureFlagEnabled,
    useFeatureFlagPayload,
    useActiveFeatureFlags,
} from "posthog-js/react";
