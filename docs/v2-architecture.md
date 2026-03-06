# Drimit v2: Architecture & Granular Pipeline

**Status:** Living Document
**Date:** February 17, 2026
**Version:** 2.5.0

---

## 1. System Overview

The Drimit architecture is a **Conditional, Atomic Pipeline**. Unlike a rigid assembly line, the protection kernel dynamically adapts to the user's security requirements.

### Key Constraints & Requirements
*   **User Control:** User provides specific flags (`use_identity`, `use_style`, etc.) at job creation.
*   **Conditional Execution:** Steps are skipped entirely (0 cost, 0 latency) if not requested.
*   **Atomic Validation:** A protection layer is never marked "Complete" until it has been saved to storage (R2) and successfully passed its specific adversarial validation module.

## 2. Updated Lifecycle (The "Select-Protect-Verify" Loop)

```mermaid
graph TD
    User([User])
    orchestrator[Next.js Orchestrator]
    D1[(D1 Database)]
    R2[(R2 Storage)]

    subgraph "Modal GPU Cloud"
        kernel[Protection Kernel]
        
        subgraph "Attacker Simulation (Validation)"
            v_id[Attacker: Face Recognition]
            v_style[Attacker: Style Cloner]
            v_edit[Attacker: Inpainter]
            v_wm[Attacker: Meta Stripper]
        end
    end

    %% Flow
    User --> |1. Upload + Select Flags| orchestrator
    orchestrator --> |2. Create Job w/ Config| D1
    orchestrator --> |3. Dispatch Request| kernel

    %% Logic: Conditional Checks
    kernel --> |"Check: use_identity?"| check_id{Flag?}
    
    %% Layer 1
    check_id -- Yes --> apply_id[Apply Identity Shield]
    apply_id --> save_id[Save L1 Artifact]
    save_id -.-> verify_id[Verify vs FaceNet]
    verify_id -.-> log_id[Log Pass/Fail]
    
    %% Layer 2
    log_id --> check_style{Flag?}
    check_id -- No --> check_style

    check_style -- Yes --> apply_style[Apply Style Poison]
    apply_style --> save_style[Save L2 Artifact]
    save_style -.-> verify_style[Verify vs CLIP]
    verify_style -.-> log_style[Log Pass/Fail]
    
    %% Layer 3
    log_style --> check_edit{Flag?}
    check_style -- No --> check_edit
    
    check_edit -- Yes --> apply_edit[Apply Edit Immunity]
    apply_edit --> save_edit[Save L3 Artifact]
    save_edit -.-> verify_edit[Verify vs Inpainter]
    verify_edit -.-> log_edit[Log Pass/Fail]
    
    %% Layer 4
    log_edit --> check_wm{Flag?}
    check_edit -- No --> check_wm
    
    check_wm -- Yes --> apply_wm[Apply Watermark]
    apply_wm --> save_wm[Save Final Artifact]
    save_wm -.-> verify_wm[Verify vs Compression]
    verify_wm -.-> log_wm[Log Pass/Fail]
    check_wm -- No --> report[Generate Full Report]
    
    %% Final
    log_wm --> report
    report --> |Final Update| D1
```

## 3. Data Schema Implications

The `config` JSON column in `artwork_jobs` and the request payload to Modal is the source of truth for the granular flags.

```typescript
// Modal Request Payload
{
  "image_url": "...",
  "config": {
    "intensity": "High"
  },
  // Granular Flags
  "use_identity_shield": true, // Vector C (Deepfakes)
  "use_style_poison": false,   // Vector B (Style Theft) - User disabled
  "use_edit_immunity": true,   // Vector A (Unauthorized Editing)
  "use_watermark": true        // Vector D (Attribution)
}
```

## 4. Validation Engine (Open Source Proxies)

We use high-performance Open Source models to approximate the capabilities of closed adversarial models.

| Risk Vector | Validation Proxy | Why this proxy? |
| :--- | :--- | :--- |
| **Identity Theft** | `FaceNet` / `MTCNN` | Standard for academic benchmarking of facial recognition. |
| **Style Theft** | `CLIP-ViT-Large` | Foundation metric for semantic similarity in Generative AI. |
| **Editing** | `Stable Diffusion Inpainting` | The most widely used open source editing engine. |
| **Attribution** | `DWT-DCT` + `JPEG-80` | Simulates standard social media compression algorithms. |
