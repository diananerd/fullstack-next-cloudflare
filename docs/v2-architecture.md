# Drimit Shield v2: Unified Pipeline Architecture

**Status:** Draft
**Date:** February 15, 2026
**Version:** 2.4.0 (Granular 4-Layer Pipeline)

---

## 1. System Overview: The Atomic Pipeline

This architecture upgrades the "Unified Pipeline" to an **Atomic Save-Verify** model. A critical change in v2.3 is that verification *never* runs on in-memory tensors. It runs on the **stored artifact** (what the user will eventually get) to ensure the verification result matches real-world utility.

The system is built on **3 Pillars**:

1.  **The Orchestrator (Next.js / Cloudflare Edge):**
    The brain. Manages state, authenticates, and maintains the definitive record in D1.

2.  **The Protection Kernel (Modal GPU):**
    The factory floor. Executes the protection layers in a strict sequence: `Identity -> Mimicry -> Editing -> Watermark`.

3.  **The Simulation Modules (Modal GPU):**
    The verifiers. Specific attack vectors (e.g., "Deepfake Attempt", "Style Clone", "Inpainting") that are invoked *after* a layer is saved.

## 2. The Lifecycle (Save-Verify Loop)

The pipeline is cyclical. We strictly save the output of a protection step to R2 *before* verifying it.

```mermaid
graph TD
    User([User])
    orchestrator[Next.js Orchestrator]
    D1[(D1 Database)]
    R2[(R2 Storage)]

    subgraph "Modal GPU Cloud"
        kernel[Protection Kernel]
        subgraph "Simulation / Verify Modules"
            v_id[Verify: Face Detect]
            v_style[Verify: Style Clone]
            v_edit[Verify: Inpainting]
            v_wm[Verify: Robustness]
        end
    end

    %% Flow
    User --> |1. Upload| orchestrator
    orchestrator --> |2. Create Job| D1
    orchestrator --> |3. Dispatch| kernel

    %% Atomic Loop: Layer 1 (Identity)
    kernel --> |4. Apply Identity (Bio-Shield)| kernel
    kernel --> |5a. Save L1 Artifact| R2
    kernel -.-> |5b. Verify L1 (Face Detect)| v_id
    v_id -.-> |5c. Result + Update Job| kernel
    
    %% Atomic Loop: Layer 2 (Mimicry)
    kernel --> |6. Apply Mimicry (Anti-Style)| kernel
    kernel --> |7a. Save L2 Artifact| R2
    kernel -.-> |7b. Verify L2 (Style Clone)| v_style
    v_style -.-> |7c. Result + Update Job| kernel

    %% Atomic Loop: Layer 3 (Editing)
    kernel --> |8. Apply Editing (Anti-Inpaint)| kernel
    kernel --> |9a. Save L3 Artifact| R2
    kernel -.-> |9b. Verify L3 (Inpainting)| v_edit
    v_edit -.-> |9c. Result + Update Job| kernel
    
    %% Atomic Loop: Layer 4 (Watermark)
    kernel --> |10. Apply Watermark| kernel
    kernel --> |11a. Save Final Artifact| R2
    kernel -.-> |11b. Verify L4 (Robustness)| v_wm
    v_wm -.-> |11c. Result + Update Job| kernel
    
    kernel --> |12. Final Report| orchestrator
    orchestrator --> |13. Update Status| D1
    orchestrator --> |14. Notify User| User
```

## 3. Component Breakdown

### A. Next.js Orchestrator
*   **Role:** State Manager & API Gateway.
*   **Responsibilities:**
    *   **Dashboard:** Displays the "Protection Trail" (4 Stages).
    *   **Dispatch:** Triggers the atomic kernel execution.

### B. Protection Kernel (`modal/protection`)
*   **Role:** Asset hardening & Flow Control.
*   **Logic:**
    *   **Order of Operations:**
        1.  **Layer 1 (Identity):** Biometric Disruption (Anti-FaceNet).
        2.  **Layer 2 (Mimicry):** Style Poisoning (Anti-LoRA).
        3.  **Layer 3 (Editing):** Diffusion Immunization (Anti-Inpainting).
        4.  **Layer 4 (The Identity):** Invisible Watermarking.
    *   **Save-Then-Verify:** The kernel writes to R2 immediately after processing.

### C. Simulation Modules (`modal/simulation`)
*   **Role:** Targeted Verification.
*   **Change:** Verification modules correspond strictly to the layer they test.
    *   `verify_identity(image)`: Checks if face is detectable (Anti-FaceNet).
    *   `verify_mimicry(image)`: Checks if style can be cloned (Anti-LoRA).
    *   `verify_editing(image)`: Checks if inpainting succeeds (Anti-Inpaint).
    *   `verify_watermark(image)`: Checks if watermark survives compression/cropping.

## 4. Data Consistency
Verification results are appended to the main Job record in D1 after each successful verify step. If a layer fails verification, the job can either abort (Fail-Fast) or continue with a warning (depending on strictness settings), but the failure is definitely logged.
