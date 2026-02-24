---
description: Run a controlled ML experiment on the pipeline and report metrics vs targets. Optionally target a specific layer.
argument-hint: [layer] [config-overrides...]
---

Run a controlled ML experiment on the protection pipeline and report results.

## Usage
`/ml-experiment [layer] [config overrides]`

Examples:
- `/ml-experiment` — full pipeline with default config
- `/ml-experiment layer_1_identity intensity=High`
- `/ml-experiment layer_2_mimicry intensity=Low use_style_poison=true use_identity_shield=false`

## Steps

### 1. Prepare
Read `.env.local` to get `MODAL_KERNEL_API_URL` and `MODAL_AUTH_TOKEN`.
If the user didn't specify a test image URL, ask for one (or use the last one they mentioned).

### 2. Build Config
Start from defaults in `src/constants/pipeline-contract.ts` (`PIPELINE_GLOBAL_CONFIG`).
Apply any overrides from the invocation. Set all unused layer flags to `false` if testing a specific layer.

### 3. Dispatch
POST to `MODAL_KERNEL_API_URL` with the config. Show the job_id returned.

### 4. Poll Status
Every 20 seconds, poll `MODAL_KERNEL_STATUS_URL` with `{"artwork_ids": ["<artwork_id>"]}`.
Show a progress line for each poll cycle: `[00:20] Status: processing — Layer 1: PASS`

### 5. Report Results
When status = "completed", display a table:

| Layer | Status | Key Metric | Value | Target | Pass? |
|-------|--------|------------|-------|--------|-------|
| Identity Shield | PASS | faces_detected | 0 | 0 | ✓ |
| Style Poison | PASS | style_similarity | 0.21 | <0.30 | ✓ |
| Edit Immunity | PASS | — | — | — | ✓ |
| Watermark | PASS | watermark_detected | YES | YES | ✓ |

Also report:
- `shield_score`: N/100
- `total_duration_ms`: Ns
- Compare against baseline if previous experiment results are available in memory

### 6. Diagnose failures
If a layer fails, read the `error` field and suggest fixes based on common ML issues:
- OOM → reduce batch size or image resolution
- Low confidence → increase epsilon/steps for that layer
- Watermark not detected → check DWT parameters
