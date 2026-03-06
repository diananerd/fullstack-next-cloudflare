---
description: Add a new adversarial protection layer end-to-end (contract + Python + verification). Takes layer name as argument.
argument-hint: [layer-name]
disable-model-invocation: true
---

Add a new protection layer to the Drimit pipeline end-to-end.

The Pipeline Contract (`src/constants/pipeline-contract.ts`) drives everything.
Adding an entry there auto-updates the UI. Only Python needs manual work.

## Required info (ask user if not provided in the invocation)
- **Layer ID**: format `layer_N_name` (e.g. `layer_5_semantic`)
- **layerKey**: short token for `config.layers[]` (e.g. `semantic`)
- **pythonFlag**: Python field name (e.g. `use_semantic_shield`)
- **label / uiDescription**: what the user sees in the dialog
- **description**: technical description for the audit trail
- **verificationMetrics**: what the verification step measures and returns
- **configFields**: any user-configurable inputs for this layer (or empty)

## Execution steps

### 1. Update the Contract
Add the new `PipelineLayerConfig` entry to `PIPELINE_LAYERS` in `src/constants/pipeline-contract.ts`.
Place it in logical order (after the existing layers).

### 2. Add Python Flag
In `modal/protection/main.py`, add to `ProtectionRequest`:
```python
<pythonFlag>: bool = True
```

### 3. Add Protection Logic
In `modal/protection/main.py`, add a step in `run_shield_pipeline`:
```python
if request.<pythonFlag>:
    # ... protection logic
    step_result = StepResult(step_name="<layer_id>", status="PASS", ...)
else:
    step_result = StepResult(step_name="<layer_id>", status="SKIPPED")
steps.append(step_result)
```

### 4. Add Verification
In `modal/simulation/main.py`, add a `@modal.method()` named `verify_<layerKey>`.
It must return a dict with keys matching the `verificationMetrics[].key` values in the contract.

### 5. Wire Verification in Protection
In `modal/protection/main.py`, call the new verify method in `run_shield_pipeline`
and populate `step_result.verification_meta` with the returned dict.

### 6. Validate
Run `python3 scripts/check-contract.py`.
Fix any reported mismatches before proceeding.

### 7. Report
List all changed files. Remind the user:
- UI (dialog checkboxes + audit trail metrics) updated automatically via the contract.
- Run `/deploy-modal` to push the changes to Modal.

**Note**: `dispatch-job.ts` does NOT need manual changes — it maps flags via the contract automatically.
