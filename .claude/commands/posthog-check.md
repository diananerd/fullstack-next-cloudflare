---
description: Check PostHog integration health — env vars, recent events flowing, key funnel metrics for the last 24h.
disable-model-invocation: true
---

Check the PostHog analytics integration for Drimit.

## Steps

### 1. Verify Configuration
Check that required env vars are present in `.env.local`:
- `NEXT_PUBLIC_POSTHOG_KEY` — public API key (starts with `phc_`)
- `NEXT_PUBLIC_POSTHOG_HOST` — host URL (`https://us.posthog.com` or `https://eu.posthog.com`)
- `POSTHOG_PERSONAL_API_KEY` — personal API key for MCP access (starts with `phx_`)

If any are missing, report which ones and how to obtain them.

### 2. Check Code Integration Points
Verify these files import and call Analytics correctly:
- `src/lib/analytics.ts` — server-side capture helpers + `Analytics.captureException()` + `getFeatureFlag()`
- `src/lib/feature-flags.ts` — re-exports `getFeatureFlag`, `useFeatureFlagEnabled`, `useFeatureFlagPayload`
- `src/providers/analytics-provider.tsx` — client provider (pageview + identify + Web Vitals + session replay + error listeners)
- `src/app/layout.tsx` — wraps `<AnalyticsProvider>`
- `src/app/(dashboard)/error.tsx` — dashboard error boundary → `ph?.captureException()`
- `src/app/global-error.tsx` — global error boundary → `posthog.captureException()`
- `src/modules/artworks/actions/create-artwork.action.ts` — `artwork_uploaded`, `Analytics.captureException()`
- `src/modules/artworks/actions/protect-artwork.action.ts` — `protection_started`, `credits_insufficient`, `Analytics.captureException()`
- `src/modules/artworks/components/protect-artwork-dialog.tsx` — `protection_dialog_opened`, `protection_pipeline_queued`

Use Grep to confirm each event name appears in the correct file.

### 3. Query PostHog via MCP (if POSTHOG_PERSONAL_API_KEY is set)
Use the PostHog MCP to query last 24h events:
- Total event count by event name
- Any `protection_failed` events with errors
- `credits_insufficient` count vs `protection_started` count (friction ratio)
- `$exception` count — any unhandled errors to investigate

### 4. Report
Output a status table:

```
PostHog Integration Health
==========================
Config:
  NEXT_PUBLIC_POSTHOG_KEY    ✓ / ✗ MISSING
  NEXT_PUBLIC_POSTHOG_HOST   ✓ / ✗ MISSING
  POSTHOG_PERSONAL_API_KEY   ✓ / ✗ MISSING (MCP won't work)

Code integration:
  analytics-provider.tsx        ✓ / ✗  (pageviews, identify, Web Vitals, error listeners)
  analytics.ts                  ✓ / ✗  (captureException, getFeatureFlag)
  feature-flags.ts              ✓ / ✗  (useFeatureFlagEnabled re-export)
  error.tsx (dashboard)         ✓ / ✗  (ph?.captureException)
  global-error.tsx              ✓ / ✗  (posthog.captureException)
  create-artwork.action.ts      ✓ / ✗  (artwork_uploaded, captureException)
  protect-artwork.action.ts     ✓ / ✗  (protection_started, credits_insufficient, captureException)
  protect-artwork-dialog.tsx    ✓ / ✗  (protection_dialog_opened, protection_pipeline_queued)

Last 24h (via MCP):
  artwork_uploaded:             N events
  protection_dialog_opened:     N events
  protection_started:           N events
  protection_pipeline_queued:   N events
  protection_completed:         N events
  protection_failed:            N events
  credits_insufficient:         N events
  $exception:                   N events  ← should be 0 or low

Funnel conversion:
  Dialog → Start:               N%
  Start → Complete:             N%
  Credit friction rate:         N%
  Exception rate:               N per day
```
