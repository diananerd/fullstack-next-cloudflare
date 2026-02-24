# Drimit Shield v2: Technical Specification (SOTA & Legacy)

**Status:** Living Document
**Date:** February 17, 2026
**Version:** 3.0.0 (SOTA Compliant)

---

## 1. Executive Summary: The Dual-Stack Defense

To protect against the full spectrum of generative AI threats in 2026, Drimit Shield implements a **Dual-Stack Defense** strategy. Every protection layer must simultaneously disrupt:
1.  **Legacy Models (2022-2024):** Stable Diffusion 1.5, SD 2.1, FaceNet, standard Deepfakes.
2.  **SOTA Models (2025-2026):** Flux.1, SD3, Midjourney v7, InsightFace (ArcFace), and highly capable inpainting models.

This document details the exact architectures, models, and attack vectors required for each layer.

---

## 2. Layer 1: Identity Shield (Anti-Deepfake)

**Goal:** Prevent unauthorized identity cloning and deepfake generation.
**Threats:**
*   **Legacy:** `FaceNet`, `Dlib`, `MTCNN`.
*   **SOTA:** `InsightFace` (ArcFace/Buffalo_L), `GhostFace`, `InstantID`, `Reactor`, `Roop`.

### Technical Implementation
*   **Defense Mechanism:** **Ensemble Projected Gradient Descent (PGD).**
    *   **Target A (Legacy):** `facenet_pytorch (InceptionResnetV1)`.
    *   **Target B (SOTA - CRITICAL):** `InsightFace (ArcFace r100)`.
    *   **Optimization:** We optimize a perturbation $\delta$ such that the cosine similarity between the embedding of $f(x)$ and $f(x+\delta)$ is minimized for *both* targets simultaneously.
    *   **Constraint:** $L_\infty$ norm bound $\epsilon=0.05$ (imperceptible noise).

*   **Validation (The "Fire"):**
    *   **Engine:** `InsightFace (Buffalo_L)`.
    *   **Pass Condition:** No face detected OR identity similarity score $< 0.4$ (Threshold for verification).
    *   **Fail Condition:** Face detected with identity match $> 0.6$.

---

## 3. Layer 2: Style Poison (Anti-Mimicry / Concept Theft)

**Goal:** Prevent training of LoRAs/Fine-tunes on the artist's style.
**Threats:**
*   **Legacy:** Stable Diffusion 1.5 (uses `OpenAI CLIP ViT-L/14`).
*   **SOTA:** SDXL (uses `OpenCLIP ViT-G/14`), SD3 (uses `T5` + `OpenCLIP`), Flux.1 (uses `T5-XXL` + `ViT`).

### Technical Implementation
*   **Defense Mechanism:** **Multi-Vantage Point Poisoning.**
    *   **Target A (Standard):** `OpenAI CLIP ViT-L/14` (The "Eye" of SD 1.5).
    *   **Target B (Advanced):** `LAION OpenCLIP ViT-H/14` (The "Eye" of SDXL/SD3).
    *   **Target C (Visual):** `Facebook DINOv2` (Pure visual semantic feature extractor).
    *   **Optimization:** Maximizing the FEATURE DISTANCE (Concept Shift) in the joint embedding space of A + B.
    *   **Logic:** If the image "looks" different to CLIP-L and CLIP-H, widespread training failure occurs.

*   **Validation (The "Fire"):**
    *   **Engine:** `OpenCLIP ViT-G/14`.
    *   **Metric:** Cosine Similarity Check.
    *   **Pass Condition:** Clip Similarity $< 0.92$ (Significant semantic drift) while PSNR $> 30dB$ (High visual quality).

---

## 4. Layer 3: Edit Immunity (Anti-Inpainting / Manipulation)

**Goal:** Prevent unauthorized modification (nudification, object removal).
**Threats:**
*   **Legacy:** `runwayml/stable-diffusion-inpainting` (SD 1.5).
*   **SOTA:** `black-forest-labs/FLUX.1-schnell` (Inpainting Mode), `stabilityai/stable-diffusion-3-medium`.

### Technical Implementation
*   **Defense Mechanism:** **VAE disruption (Latent Space Attach).**
    *   Most modern models use a Variation Autoencoder (VAE) to compress images before processing.
    *   **Target A:** `stabilityai/sd-vae-ft-mse` (SD 1.5 Standard).
    *   **Target B:** `stabilityai/sdxl-vae` (SDXL/Flux Standard).
    *   **Attack:** Inject adversarial noise that causes the VAE *encoder* to map the image to a chaotic region of the latent space, causing the *decoder* to output artifacts.

*   **Validation (The "Fire"):**
    *   **Engine:** `StableDiffusionInpaintPipeline` (SD 1.5) & `FluxPipeline` (if memory permits).
    *   **Pass Condition:** Inpainted region contains high variance noise or grey artifacts.
    *   **Fail Condition:** Seamless, coherent editing.

---

## 5. Layer 4: Provenance (Watermarking)

**Goal:** Prove ownership even after metadata stripping.
**Threats:**
*   **Legacy:** Metadata stripping (Social Media).
*   **SOTA:** VAE Reconstruction (Img2Img) which destroys pixel-level watermarks.

### Technical Implementation
*   **Defense Mechanism:** **Frequency Domain Injection (DWT/DCT).**
    *   **Implementation:** `invisible-watermark` (Blind DWT-DCT-SVD).
    *   **Payload:** 32-bit UUID Hash.
    *   **Redundancy:** Embedded at multiple frequency bands to survive resizing.

*   **Validation (The "Fire"):**
    *   **Attack:** JPEG Compression (Q=80) + Resize (50%).
    *   **Pass Condition:** Payload recovery rate $> 80\%$.
    *   **Fail Condition:** Payload lost.

---

## 6. Infrastructure & Optimization

*   **Platform:** Modal
*   **Container Strategy:**
    *   **`protection-kernel`**: Needs `torch`, `diffusers`, `transformers`, `insightface`, `onnxruntime-gpu`, `open_clip_torch`.
    *   **`simulation-engine`**: Same stack + `imwatermark`.
*   **Optimization:**
    *   **Build-time Model Fetching:** All weights (`buffalo_l`, `clip-vit-h`, `sdxl-vae`) must be baked into the image, strictly no runtime downloads.
    *   **Shared Volume/Memory:** Use `modal.Volume` or simplistic passing to avoid re-loading huge models if possible.

