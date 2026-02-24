---
description: Deploy Modal apps (simulation then protection). Always run /check-contract first.
disable-model-invocation: true
allowed-tools: Bash(.venv/bin/modal deploy:*), Bash(.venv/bin/modal app:*)
---

Deploy the Modal apps in the correct dependency order.

**simulation must always deploy before protection** (protection imports SimulationEngine at runtime).

Steps:
1. Run `/check-contract` first to catch any contract mismatches before deploying.
2. Deploy simulation: `.venv/bin/modal deploy modal/simulation/main.py`
   - Wait for it to complete. If it fails, stop and report the error — do NOT continue to protection.
3. Deploy protection: `.venv/bin/modal deploy modal/protection/main.py`
   - Wait for it to complete.
4. Report the final URLs for both apps.
5. Remind the user to test with `/pipeline-status` after deploying.

If either step fails, diagnose the error:
- `ModuleNotFoundError` → missing pip_install in the image definition
- `ImageBuildError` → check the image's `run_function` / `download_models`
- Auth errors → check `.venv/bin/modal token set`
