---
description: Check PostHog integration health — env vars, recent events flowing, key funnel metrics for the last 24h.
disable-model-invocation: true
---

Check the PostHog analytics integration for Drimit Shield.

## Steps

### 1. Verify Configuration
Check that required env vars are present in `.env.local`:
- `NEXT_PUBLIC_POSTHOG_KEY` — public API key (starts with `phc_`)
- `NEXT_PUBLIC_POSTHOG_HOST` — host URL (`https://us.posthog.com` or `https://eu.posthog.com`)
- `POSTHOG_PERSONAL_API_KEY` — personal API key for MCP access (starts with `phx_`)

If any are missing, report which ones and how to obtain them.

### 2. Check Code Integration Points
Verify these files import and call Analytics correctly:
- `src/lib/analytics.ts` — server-side capture helpers
- `src/providers/analytics-provider.tsx` — client provider (pageview + identify)
- `src/app/layout.tsx` — wraps `<AnalyticsProvider>`
- `src/modules/artworks/actions/create-artwork.action.ts` — `artwork_uploaded`
- `src/modules/artworks/actions/protect-artwork.action.ts` — `protection_started`, `credits_insufficient`
- `src/modules/artworks/components/protect-artwork-dialog.tsx` — `protection_dialog_opened`

Use Grep to confirm each event name appears in the correct file.

### 3. Query PostHog via MCP (if POSTHOG_PERSONAL_API_KEY is set)
Use the PostHog MCP to query last 24h events:
- Total event count by event name
- Any `protection_failed` events with errors
- `credits_insufficient` count vs `protection_started` count (friction ratio)

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
  analytics-provider.tsx     ✓ / ✗
  create-artwork.action.ts   ✓ / ✗
  protect-artwork.action.ts  ✓ / ✗
  protect-artwork-dialog.tsx ✓ / ✗

Last 24h (via MCP):
  artwork_uploaded:          N events
  protection_started:        N events
  protection_completed:      N events
  protection_failed:         N events
  credits_insufficient:      N events

Funnel conversion:
  Dialog → Start:            N%
  Start → Complete:          N%
  Credit friction rate:      N%
```
