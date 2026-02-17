# Drimit Shield v2: Database Schema (Atomic Trail)

**Status:** Draft
**Date:** February 12, 2026
**Version:** 2.2.0 (Atomic Updates)

---

## 1. Core Principles

To support **Atomic Step Execution**, the database must track the *progression* of a job, not just its final state. We need to know: "Did it fail at the Watermark step or the Poison step?" and "Where is the intermediate image for debugging?".

## 2. Updated Schema Definitions

### `artwork_jobs`
Now serves as a detailed ledger of the atomic pipeline.

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | text (PK) | UUID |
| `artwork_id` | text | FK -> artworks.id |
| `job_type` | text | `PROTECTION` |
| `status` | text | `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED` |
| `current_step` | text | **New:** e.g., `LAYER_2_BIO`, `VERIFY_3_POISON` |
| `result` | json | **Updated:** Contains the `step_trail` array. |
| `created_at` | integer | timestamp |
| `updated_at` | integer | timestamp |
| `error` | text | **New:** Specific error message if FAILED |

---

## 3. JSON Structures

### `artwork_jobs.result` (The Atomic Trail)
This structure allows the UI to render a progress bar with "Checkmarks" for each passed layer and a "Debug" link for each step's output.

```typescript
type ProtectionJobResult = {
  final_url?: string; // Only present if ALL steps passed
  
  steps: [
    {
      step_name: "layer_1_identity";
      status: "PASS" | "FAIL";
      r2_key: "jobs/123/step1_bio.png"; 
      verification_meta: {
        faces_detected: 0
      }
    },
    {
      step_name: "layer_2_mimicry";
      status: "PASS" | "FAIL";
      r2_key: "jobs/123/step2_style.png";
      verification_meta: {
        style_sim: 0.15
      }
    },
     {
      step_name: "layer_3_editing";
      status: "PASS" | "FAIL";
      r2_key: "jobs/123/step3_edit.png";
      // ...
    },
    {
      step_name: "layer_4_watermark";
      status: "PASS" | "FAIL";
      r2_key: "jobs/123/step4_wm.png";
      verification_meta: {
        decoded_uuid: "...",
        match: true
      }
    }
  ],
  
  total_duration_ms: number;
};
```

### `artworks.metadata`
Remains mostly similar, but `protection_summary` is now an aggregate or derived from the granular verification steps.

```typescript
type ArtworkMetadata = {
  width: number;
  height: number;
  // ...
  protection_summary: {
    identity: boolean;
    mimicry: boolean;
    editing: boolean;
    watermark: boolean;
  };
};
```

## 4. Migration Strategy

1.  **Alter** `artwork_jobs`:
    *   Add `current_step` (text) to track live progress.
    *   Add `error` (text).
    *   Update logic to write to `result` incrementally (or just once at the end with the full trail).
