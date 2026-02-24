#!/usr/bin/env python3
"""
Pipeline contract validator.

Checks that modal/protection/main.py ProtectionRequest fields
match the pythonFlags declared in src/constants/pipeline-contract.ts.

Exit 0 = OK | Exit 1 = mismatch found
"""
import re, sys, os

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read(rel_path: str) -> str:
    with open(os.path.join(BASE, rel_path)) as f:
        return f.read()


def main():
    # ── 1. Parse contract ──────────────────────────────────────────────────
    contract = read("src/constants/pipeline-contract.ts")

    layer_ids   = re.findall(r'id:\s*["\'](\w+)["\']', contract)
    layer_keys  = re.findall(r'layerKey:\s*["\'](\w+)["\']', contract)
    python_flags = re.findall(r'pythonFlag:\s*["\'](\w+)["\']', contract)

    print("─" * 50)
    print("Pipeline Contract")
    print("─" * 50)
    for i, (lid, lk, pf) in enumerate(zip(layer_ids, layer_keys, python_flags), 1):
        print(f"  Layer {i}: {lid}")
        print(f"    layerKey    → config.layers[\"{lk}\"]")
        print(f"    pythonFlag  → ProtectionRequest.{pf}")
    print()

    # ── 2. Parse ProtectionRequest in Python ───────────────────────────────
    python_src = read("modal/protection/main.py")

    req_match = re.search(
        r'class ProtectionRequest\(BaseModel\):(.*?)(?=\nclass |\Z)',
        python_src,
        re.DOTALL,
    )
    if not req_match:
        print("ERROR: ProtectionRequest class not found in modal/protection/main.py")
        sys.exit(1)

    req_fields = set(re.findall(r'^\s{4}(\w+)\s*:', req_match.group(1), re.MULTILINE))

    # ── 3. Cross-check ─────────────────────────────────────────────────────
    errors = []
    for flag in python_flags:
        if flag not in req_fields:
            errors.append(f"  MISSING in Python ProtectionRequest: '{flag}'")

    # Warn about Python bool flags not tracked in contract
    extra_flags = [f for f in req_fields if f.startswith("use_") and f not in python_flags]
    if extra_flags:
        print(f"WARNING: Python has bool flags not in contract: {extra_flags}")
        print("  (These won't be controllable from the UI)\n")

    if errors:
        print("CONTRACT CHECK FAILED:")
        for e in errors:
            print(e)
        print()
        print("Fix: add the missing fields to modal/protection/main.py ProtectionRequest")
        print("     or remove the entry from src/constants/pipeline-contract.ts")
        sys.exit(1)

    print(f"✓ Contract check passed — {len(python_flags)} flags in sync")
    print("─" * 50)


if __name__ == "__main__":
    main()
