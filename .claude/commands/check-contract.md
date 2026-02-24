Validate that the pipeline contract and Python implementation are in sync.

Run:
```
python3 scripts/check-contract.py
```

Show the full output.

If the check fails:
1. Identify which `pythonFlag` is missing from `modal/protection/main.py` ProtectionRequest.
2. Show the exact line to add (with proper type annotation and default value).
3. Ask the user if they want you to apply the fix.

If the check passes, also verify:
- Every `id` in `PIPELINE_LAYERS` matches a valid `step_name` returned by Python's `run_shield_pipeline`.
  (Check by searching `step_name=` in `modal/protection/main.py` and comparing against contract IDs.)
- Report any step_name in Python that has no contract entry (orphaned steps).
