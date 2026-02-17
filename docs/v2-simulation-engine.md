# Simulation Engine: Modular Verification

**Status:** Active Development
**Target System:** `modal/simulation/`
**Role:** In-Loop Verification

The Simulation Engine serves as the "Auditor" for the Protection Kernel. It provides specific test suites that correspond to the three layers of the Shield.

---

## 1. Overview: Layer-Specific Testing

The simulation modules are no longer a generic bag of tests. They are strictly mapped to the protection layers.

**Order of Operations:**
1.  **Test 1 (Identity):** Face Detection / Deepfake Attempt.
2.  **Test 2 (Mimicry):** Style Clone / LoRA Training sim.
3.  **Test 3 (Editing):** Inpainting Attack.
4.  **Test 4 (Watermark):** Robustness / Purge.

## 2. Verification Modules

### Test 1: Identity Verification (Layer 1)
*   **Goal:** Ensure the face is protected against biometric scraping.
*   **Sub-Tests:**
    1.  **Biometric Scan:** Face Detection (RetinaFace).
    2.  **Deepfake Swap:** Attempt an InsightFace swap.

### Test 2: Mimicry Verification (Layer 2)
*   **Goal:** Ensure the style cannot be easily cloned.
*   **Sub-Tests:**
    1.  **Style Clone:** Run Img2Img with specific style prompt.
    2.  **Metric:** CLIP Style Similarity < Threshold.

### Test 3: Editing Verification (Layer 3)
*   **Goal:** Ensure the image resists manipulation.
*   **Sub-Tests:**
    1.  **Inpaint Attack:** Attempt to remove an object or expand the image.
    2.  **Pass:** Inpainted area is blurry or incoherent.

### Test 4: Robustness & Purge (Layer 4)
*   **Goal:** Ensure the Watermark (Identity) survives.
*   **Inputs:** The saved artifact from Layer 2.
*   **Sub-Tests:**
    1.  **Compression Attack:** Convert to JPEG (Quality 80).
    2.  **Geometry Attack:** Resize to 90%.
    3.  **Decode:** Attempt to extract the UUID from the attacked versions.
    4.  **Pass:** UUID is successfully recovered from the distorted versions.

## 3. Integration Interface

Each verification module accepts a file URL (or bytes) and returns a standardized JSON result:

```json
{
  "layer": "layer_1_anti_ai",
  "passed": true,
  "score": 0.95,
  "details": {
    "face_detected": false,
    "clone_similarity": 0.45
  },
  "timestamp": "2026-02-15T12:00:00Z"
}
```
