# Drimit v2: Master Plan

**Status:** Living Document
**Date:** February 17, 2026
**Version:** 2.1.0

---

## 1. Executive Summary

Drimit is a comprehensive protection suite for visual assets, designed to safeguard copyrighted works against unauthorized AI utilization. Unlike passive tagging systems, Drimit employs active adversarial perturbations and invisible watermarking to technically enforce usage rights.

The system empowers artists to upload original works, apply granular protections against specific threats, and receive a rigorous "Protection Report" verifying the resilience of their assets against real-world unauthorized usage vectors.

## 2. Core Philosophy: "Verified Resistance"

We operature under the principle of **Verified Resistance**. It is insufficient to merely apply a filter; the system must prove that the protected asset withstands the specific unauthorized actions it claims to prevent.

1.  **Granular Selection:** Users choose exactly which risks they want to mitigate (e.g., specific flags for Style Theft, Deepfakes).
2.  **Conditional Processing:** The pipeline dynamically constructs a chain of defense layers based on user selection.
3.  **Adversarial Validation:** Each applied protection is immediately validated by mimicking a real unauthorized actor (e.g., attempting to clone a style or inpaint an image) using state-of-the-art Open Source models that approximate leading closed models.

## 3. Threat Model & Defense Layers

Drimit addresses four primary unauthorized usage vectors. Each vector corresponds to a specific protection layer and validation module.

### Vector A: Unauthorized Image Editing (Inpainting)
*   **Risk:** Third parties modifying the artwork (e.g., removing objects, changing context, Nudifying) without consent.
*   **Defense (Layer 3):** **Diffusion Immunization.** Injects high-frequency adversarial noise targeting the latent space of diffusion models (SDXL, SD 1.5, Flux) to disrupt inpainting attempts.
*   **Validation:** attempts to inpaint a masked region of the protected image. Success is defined by the generation of noise or incoherent artifacts instead of the requested edit.

### Vector B: Style Theft (Mimicry)
*   **Risk:** unauthorized training of LoRAs or Fine-tunes to mimic the artist's unique visual style.
*   **Defense (Layer 2):** **Style Poisoning.** Perturbs the semantic feature maps (CLIP/SigLIP) to disassociate the image's visual style from its text embedding, confusing training objectives.
*   **Validation:** Measures the semantic distance (CLIP Score) between the protected image and its visual concept, ensuring they are technically dissimilar to AI models while visually identical to humans.

### Vector C: Unauthorized Deepfakes (Identity Theft)
*   **Risk:** Using character or subject likeness for unauthorized generations (Deepfakes).
*   **Defense (Layer 1):** **Identity Shield.** Micro-shifts facial landmarks and textures to disrupt facial recognition (FaceNet) and identity preservation during generation.
*   **Validation:** Runs industry-standard face detection (MTCNN/RetinaFace). Passing requires the system to fail at detecting or recognizing the face in the protected image.

### Vector D: Attribution Denial (Provenancing)
*   **Risk:** Large providers or unauthorized users stripping metadata and denying usage of the copyrighted material.
*   **Defense (Layer 4):** **Invisible Watermarking.** Embeds a robust, invisible identifier (UUID/Hash) into the frequency domain (DCT/DWT) of the image.
*   **Validation:** Simulates an "Attack" scenario (Compression/Social Media Upload) and attempts to blindly decode the watermark. Success is defined by the recovery of the unique Artwork ID.

## 4. Model Capabilities & Infrastructure

*   **Model Agnostic Defense:** Designed to resist both Legacy models (Stable Diffusion 1.5, SDXL) and Next-Gen models (Grok 3, GPT-5+, VAX, Nano Banana).
*   **Open Source Validation:** Validation mimics top-tier closed models using the best available Open Source proxies running on **Modal**.
*   **Architecture:** Optimized for "Build-time" generation. High-latency protection jobs run asynchronously, delivering static, verified assets to the user.

## 5. Roadmap

### Phase 1: Core Protection Engine (Current Focus)
*   Start/Stop Granular Control (Implemented).
*   Layer 4: Watermarking & Provenance (Implemented).
*   Layer 1: Identity Shield (Implemented).
*   Layer 3: Edit Immunity (Next Priority).

### Phase 2: Advanced Validation
*   Refine "Attacker" simulation profiles to better approximate next-gen models.
*   Dashboard reporting integration.
