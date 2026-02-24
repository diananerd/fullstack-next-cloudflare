---
description: Show full pipeline status — active DB jobs, Modal state, and discrepancies.
disable-model-invocation: true
allowed-tools: Bash(wrangler d1 execute:*), Bash(pnpm db:inspect:local:*)
---

Show the full end-to-end status of the protection pipeline.

## Steps

### 1. DB State (Local)
Run:
```
pnpm db:inspect:local
```
Then query active jobs:
```
wrangler d1 execute drimit_shield_db --local \
  --command="SELECT aj.id, aj.artwork_id, aj.status, aj.external_id, aj.updated_at, a.protection_status FROM artwork_jobs aj JOIN artworks a ON a.id = aj.artwork_id WHERE aj.status IN ('queued','processing','pending') ORDER BY aj.updated_at DESC LIMIT 20;"
```

### 2. Modal Status
If there are active jobs with `external_id`, read `MODAL_KERNEL_STATUS_URL` from `.env.local`.
POST to it with the artwork_ids from step 1.
Show what Modal knows about each job.

### 3. Cross-reference
Compare DB status vs Modal status.
Flag discrepancies:
- DB says `queued` but Modal has no record → dispatch never reached Modal
- DB says `processing` but Modal says `completed` → cron hasn't run yet
- DB says `processing` for >30 min → likely timed out

### 4. Summary
```
Active jobs: N
  PENDING:    N  (not yet dispatched)
  QUEUED:     N  (dispatched, waiting for GPU)
  PROCESSING: N  (running on Modal)

Discrepancies: N
```

### 5. Recent failures
Show last 3 failed jobs with their error messages:
```
wrangler d1 execute drimit_shield_db --local \
  --command="SELECT id, artwork_id, error_message, updated_at FROM artwork_jobs WHERE status='failed' ORDER BY updated_at DESC LIMIT 3;"
```
