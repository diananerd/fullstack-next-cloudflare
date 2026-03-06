# Drimit v2: API & Integration Guide

**Status:** Draft
**Date:** February 12, 2026
**Version:** 2.1.0

---

## 1. REST API

The Next.js backend exposes endpoints for managing the protection lifecycle.

### `POST /api/upload`
Initiate a protection job.

**Request:**
```json
{
  "filename": "my_art.jpg",
  "content_type": "image/jpeg",
  "size": 1048576,
  "config": "MAX_SECURITY"
}
```

**Response:**
```json
{
  "upload_url": "https://r2....",
  "job_id": "uuid-1234..."
}
```

### `GET /api/jobs/:id`
Poll for status.

**Response:**
```json
{
  "id": "uuid-1234...",
  "status": "SIMULATING",
  "progress": 65,
  "logs": [
    "[L1] Done",
    "[SIM] Running..."
  ],
  "result": {
      "protected_url": "...",
      "manifest_url": "..."
  }
}
```

---

## 2. Modal -> Next.js Communication (Polling Strategy)

We strictly use **Polling / Cron** to synchronize state between Modal (GPU) and Next.js (D1). **No Webhooks.**

### The "Sync" Cron Job
The Next.js Orchestrator runs a scheduled task (Cron) every minute (or shorter interval via `crons` in `wrangler.toml`) to check the status of active Modal jobs.

**Job Name:** `sync-modal-status`

**Logic:**
1.  **Fetch Active Jobs:** Query D1 for jobs in `PROCESSING` or `SIMULATING` state.
2.  **Batch Lookups:** For each job, call `modal.Function.lookup("drimit-shield", "get_job_status")`.
3.  **Update State:**
    *   If `status == "COMPLETED"`, update D1 with `protected_url` & `manifest_url`.
    *   If `status == "FAILED"`, mark job as `FAILED` and log error.
    *   If `status == "RUNNING"`, update `progress` percentage in D1.

### Polling Contract (JSON Schema)
The Modal function `get_job_status(job_ids: List[str])` must return:

```json
{
  "job_id_1": {
    "status": "COMPLETED",
    "updated_at": "2026-02-12T10:00:00Z",
    "payload": {
      "protected_url": "https://r2...",
      "simulation_score": 0.85
    }
  },
  "job_id_2": {
    "status": "RUNNING",
    "progress": 45,
    "current_step": "layer_3_poison"
  }
}
```

## 3. Environment Variables

**Next.js (.env.local):**
```bash
DATABASE_URL=...
R2_ACCESS_KEY=...
R2_SECRET_KEY=...
MODAL_TOKEN_ID=...
MODAL_TOKEN_SECRET=...
```

**Modal (modal.Secret):**
```bash
R2_BUCKET_NAME=...
# No Webhook URLs needed.
HF_TOKEN=... (For model downloads)
```
