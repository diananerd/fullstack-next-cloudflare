Compare environment variables across all config files and report inconsistencies.

## Files to compare
1. `.env.local` — Next.js dev server
2. `.dev.vars` — Wrangler dev (Cloudflare Workers local)
3. `wrangler.jsonc` → `vars` section — Cloudflare Workers production

## Steps

1. Read all three files.
2. Build a matrix of all variable names × which files contain them.
3. Output a table like:

```
Variable                        | .env.local | .dev.vars | wrangler.jsonc vars
─────────────────────────────────────────────────────────────────────────────
MODAL_KERNEL_API_URL            |     ✓      |     ✓     |        ✓
MODAL_AUTH_TOKEN                |     ✓      |     ✓     |        ✗  ← MISSING
R2_ASSET_BASE_URL               |     ✓      |     ✓     |        ✓
```

4. Flag:
   - Variables missing from `.dev.vars` (breaks `wrangler dev`)
   - Variables missing from `.env.local` (breaks `next dev`)
   - Variables with **different values** between `.env.local` and `.dev.vars`
     (expected differences: BETTER_AUTH_URL, R2_ASSET_BASE_URL point to different hosts)

5. For each issue, propose the fix and ask before applying.

## Don't touch
- `wrangler.jsonc` vars intentionally uses production values (assets.drimit.ai, drimit.io).
  This is correct — only flag if a variable is completely absent.
