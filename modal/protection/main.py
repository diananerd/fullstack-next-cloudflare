import modal
import os
import time
import uuid
import hashlib
import io
import json
import warnings
from typing import Dict, Any, Optional, List
from pydantic import BaseModel
import requests
from PIL import Image

# Types (Centralized)
class ProtectionRequest(BaseModel):
    image_url: str
    artwork_id: str
    user_id: str
    config: Dict[str, Any] = {}
    is_preview: bool = False
    # Granular Protection Flags
    use_identity_shield: bool = True
    use_style_poison: bool = True
    use_edit_immunity: bool = True
    use_watermark: bool = True
    # Path routing (V2 unified mode)
    # R2 key of the original image: {userId}/{sha256}/original.ext
    # If provided, output goes to {userId}/{sha256}/protected.png (new convention)
    # If absent, falls back to legacy path for backward compat
    image_r2_key: Optional[str] = None
    # Base URL for publicly-accessible R2 assets (needed by SimulationEngine to fetch artifacts)
    r2_public_base_url: str = "https://assets.drimit.ai"

class StepResult(BaseModel):
    step_name: str
    status: str # PASS, FAIL, SKIPPED, PENDING
    r2_key: Optional[str] = None
    r2_key_original: Optional[str] = None  # R2 key of original-image verification artifact (v3)
    verification_meta: Dict[str, Any] = {}
    error: Optional[str] = None
    duration_ms: float = 0

class ProtectionJobResult(BaseModel):
    artwork_id: str
    status: str
    original_image_url: str
    final_url: Optional[str] = None
    steps: List[StepResult] = []
    total_duration_ms: float
    error_message: Optional[str] = None
    shield_score: float = 0.0 # Aggregated Score (0-100)
    protection_field: Dict[str, Any] = {}

# Config
R2_BUCKET_PROD = "drimit-shield-bucket"
R2_BUCKET_DEV = "drimit-shield-dev-bucket"

# App Declaration
app = modal.App("drimit-shield-kernel")

# Reference Simulation
simulation_engine = modal.Cls.from_name("drimit-shield-simulation", "SimulationEngine")

# Persistent State
job_states = modal.Dict.from_name("shield-job-states", create_if_missing=True)
job_map = modal.Dict.from_name("shield-job-map", create_if_missing=True) # artwork_id -> job_id

# Image Definition: Heavy GPU Image
def download_models():
    import os
    import torch
    import insightface
    from diffusers import StableDiffusionImg2ImgPipeline, AutoencoderKL
    from facenet_pytorch import InceptionResnetV1

    # Explicit HF login — handles any env var name (HF_TOKEN or HUGGING_FACE_HUB_TOKEN)
    hf_token = os.environ.get("HF_TOKEN") or os.environ.get("HUGGING_FACE_HUB_TOKEN")
    if hf_token:
        from huggingface_hub import login
        login(token=hf_token, add_to_git_credential=False)
        print("HuggingFace login successful.")

    # 1. SD 1.5 (Layer 3 VAE legacy proxy + fallback img2img)
    print("Downloading Stable Diffusion v1-5...")
    model_id = "runwayml/stable-diffusion-v1-5"
    if torch.cuda.is_available():
        pipe = StableDiffusionImg2ImgPipeline.from_pretrained(model_id, torch_dtype=torch.float16, safety_checker=None)
    else:
        pipe = StableDiffusionImg2ImgPipeline.from_pretrained(model_id, safety_checker=None)
    pipe.save_pretrained("/models/stable-diffusion-v1-5")

    # 2. CLIP ViT-L/14 (Layer 2 legacy proxy)
    from transformers import CLIPModel, CLIPProcessor
    print("Downloading CLIP ViT-L/14 (Layer 2 legacy)...")
    CLIPModel.from_pretrained("openai/clip-vit-large-patch14")
    CLIPProcessor.from_pretrained("openai/clip-vit-large-patch14")

    # 3. OpenCLIP ViT-H/14 (Layer 2 primary proxy — SDXL/IP-Adapter class)
    print("Downloading OpenCLIP ViT-H/14 (Layer 2 primary)...")
    try:
        import open_clip
        open_clip.create_model_and_transforms('ViT-H-14', pretrained='laion2b_s32b_b79k')
        print("OpenCLIP ViT-H/14 cached successfully.")
    except Exception as e:
        print(f"OpenCLIP ViT-H/14 warning: {e}")

    # 4. InsightFace antelopev2 (Layer 1 primary — ArcFace R100/Glint360K, InstantID era)
    # Note: buffalo_l is NOT needed in protection — only antelopev2 is used for face detection.
    # buffalo_l lives in simulation/main.py (verify_identity dual-run).
    print("Downloading InsightFace antelopev2...")
    try:
        app_v2 = insightface.app.FaceAnalysis(name='antelopev2', providers=['CUDAExecutionProvider'])
        app_v2.prepare(ctx_id=0, det_size=(640, 640))
        print("antelopev2 cached successfully.")
    except Exception as e:
        print(f"InsightFace antelopev2 warning: {e}")

    # 6. InceptionResnetV1/VGGFace2 (differentiable identity proxy for PGD)
    print("Downloading InceptionResnetV1 (VGGFace2 differentiable proxy)...")
    InceptionResnetV1(pretrained='vggface2').eval()

    # 7. FLUX VAE (Layer 3 primary proxy — 16-channel, modern diffusion)
    print("Downloading FLUX VAE (16-channel, Layer 3 primary)...")
    try:
        AutoencoderKL.from_pretrained(
            "black-forest-labs/FLUX.1-schnell",
            subfolder="vae",
            torch_dtype=torch.float32,
        )
        print("FLUX VAE cached successfully.")
    except Exception as e:
        print(f"FLUX VAE warning: {e}")

    # 8. TrustMark (Layer 4 — neural steganographic watermarking)
    print("Downloading TrustMark-C watermark model...")
    try:
        from trustmark import TrustMark
        TrustMark(verbose=False, model_type='C')
        print("TrustMark-C cached successfully.")
    except Exception as e:
        print(f"TrustMark warning: {e}")
    
kernel_image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install("git", "libgl1", "libglib2.0-0", "wget", "libsm6", "libxext6", "gcc", "g++")
    .pip_install(
        "torch>=2.6.0,<2.8.0", "torchvision>=0.21.0,<0.23.0",
        "diffusers>=0.30.0,<0.35.0", "transformers>=4.41.0,<5.0.0",
        "accelerate>=0.26.0,<2.0.0", "huggingface-hub>=0.22.0,<1.0.0",
        "numpy<2", "scipy", "safetensors", "opencv-python",
        "ftfy", "tqdm",
        "fastapi[standard]", "requests", "Pillow", "boto3",
        "open_clip_torch",
        "trustmark",
        "insightface==0.7.3", "onnxruntime-gpu>=1.16.0,<2.0.0",
        "facenet-pytorch"
    )
    .run_function(download_models, gpu="any", secrets=[modal.Secret.from_name("shield-secret")])
)

app.image = kernel_image

@app.cls(
    gpu="T4",
    timeout=1200,
    secrets=[
        modal.Secret.from_name("shield-secret"),
        modal.Secret.from_name("cloudflare-r2-secret")
    ],
    max_containers=2 # Limit concurrency
)
class ProtectionKernel:
    
    def _get_r2_client(self):
        import boto3
        # Try to get endpoint from various sources
        endpoint = os.environ.get("R2_ENDPOINT")
        if not endpoint and os.environ.get("CLOUDFLARE_ACCOUNT_ID"):
             endpoint = f"https://{os.environ['CLOUDFLARE_ACCOUNT_ID']}.r2.cloudflarestorage.com"
             
        if not endpoint:
            # Fallback for some configurations where account ID is part of S3 access key? No.
            # Assuming standard R2 secret structure if available
            print("[Warning] R2 Endpoint not found, using default construction based on Account ID if available")
            
        return boto3.client(
            "s3",
            endpoint_url=endpoint,
            aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
            aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
            region_name="auto"
        )
    
    def _upload_to_r2(self, image_bytes: bytes, key: str, content_type="image/png", is_preview=False):
        s3 = self._get_r2_client()
        # Determine Bucket based on environment
        # Use PROD bucket unless clearly in preview/dev mode or instructed
        bucket = R2_BUCKET_DEV if is_preview else R2_BUCKET_PROD
        
        try:
            s3.put_object(
                Bucket=bucket,
                Key=key,
                Body=image_bytes,
                ContentType=content_type,
            )
            return key
        except Exception as e:
            print(f"Failed to upload to R2 ({bucket}): {e}")
            return None

    def _download_image(self, url):
        headers = {"User-Agent": "Mozilla/5.0"}
        r = requests.get(url, headers=headers, stream=True)
        r.raise_for_status()
        return Image.open(io.BytesIO(r.content)).convert("RGB")

    def _img_to_bytes(self, img: Image.Image, format="PNG") -> bytes:
        buf = io.BytesIO()
        img.save(buf, format=format)
        return buf.getvalue()

    # --- ATOMIC LAYERS ---

    def _apply_layer_identity(self, img: Image.Image, intensity: str) -> Image.Image:
        """Layer 1: Identity Shield — dual-proxy PGD (antelopev2 face crop + VGGFace2 global).

        Proxy 1 (primary): antelopev2 face detection → differentiable affine crop → InceptionResnetV1
        Proxy 2 (legacy):  InceptionResnetV1 on global 160×160 resize
        Combined loss: 0.65 * crop_sim + 0.35 * global_sim (falls back to 1.0 * global if no face)
        """
        import torch
        import torch.nn.functional as F
        import numpy as np
        import cv2
        import torchvision.transforms as T
        from facenet_pytorch import InceptionResnetV1
        import insightface

        print(f"[Layer 1] Applying Identity Shield v3 (dual-proxy PGD, intensity={intensity})...")
        torch.cuda.empty_cache()
        device = "cuda" if torch.cuda.is_available() else "cpu"

        # --- Load differentiable proxy (InceptionResnetV1 / VGGFace2) ---
        try:
            facenet = InceptionResnetV1(pretrained='vggface2').eval().to(device)
            for p in facenet.parameters():
                p.requires_grad = False
        except Exception as e:
            print(f"[Layer 1] Critical: failed to load InceptionResnetV1: {e}")
            return img

        # --- Prepare image tensor ---
        img_np = np.array(img).astype(np.float32) / 255.0
        H, W = img.height, img.width
        img_tensor = torch.tensor(img_np).permute(2, 0, 1).unsqueeze(0).to(device)  # [1,3,H,W]

        resizer_160 = T.Resize((160, 160), antialias=True)

        def emb_from_tensor(t):
            """InceptionResnetV1 embedding from arbitrary [1,3,H,W] tensor in [0,1]."""
            cropped = resizer_160(t)
            normed = (cropped - 0.5) / 0.5  # [0,1] → [-1,1]
            return facenet(normed)

        # --- antelopev2 face detection (non-differentiable, run once on original) ---
        has_face = False
        crop_coords = None
        try:
            providers = ['CUDAExecutionProvider'] if torch.cuda.is_available() else ['CPUExecutionProvider']
            app_v2 = insightface.app.FaceAnalysis(name='antelopev2', providers=providers)
            app_v2.prepare(ctx_id=0, det_size=(640, 640))
            img_bgr = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
            faces = app_v2.get(img_bgr)
            if len(faces) > 0:
                bbox = faces[0].bbox.astype(int)
                x1, y1, x2, y2 = int(bbox[0]), int(bbox[1]), int(bbox[2]), int(bbox[3])
                pad = int(0.15 * max(x2 - x1, y2 - y1))
                x1 = max(0, x1 - pad);  y1 = max(0, y1 - pad)
                x2 = min(W, x2 + pad);  y2 = min(H, y2 + pad)
                # Normalise to [-1,1] (PyTorch affine grid space)
                crop_coords = (
                    2 * x1 / W - 1, 2 * y1 / H - 1,
                    2 * x2 / W - 1, 2 * y2 / H - 1,
                )
                has_face = True
                print(f"[Layer 1] antelopev2 detected face bbox=({x1},{y1},{x2},{y2})")
            del app_v2
        except Exception as e:
            print(f"[Layer 1] antelopev2 detection warning: {e} — using global attack only")

        def crop_differentiable(tensor, x1n, y1n, x2n, y2n, out_size=160):
            """Differentiable affine crop via grid_sample."""
            sx = (x2n - x1n) / 2.0
            sy = (y2n - y1n) / 2.0
            tx = (x1n + x2n) / 2.0
            ty = (y1n + y2n) / 2.0
            theta = torch.tensor(
                [[[sx, 0.0, tx], [0.0, sy, ty]]],
                dtype=tensor.dtype, device=tensor.device
            )
            grid = F.affine_grid(theta, (1, tensor.size(1), out_size, out_size), align_corners=False)
            return F.grid_sample(tensor, grid, align_corners=False)

        # Pre-compute reference embeddings (no grad needed)
        with torch.no_grad():
            orig_emb_global = emb_from_tensor(img_tensor)
            if has_face:
                orig_emb_crop = emb_from_tensor(
                    crop_differentiable(img_tensor, *crop_coords)
                )

        # --- PGD settings ---
        epsilon = {"Low": 0.03, "Medium": 0.05, "High": 0.07}.get(intensity, 0.05)
        steps   = {"Low": 20,   "Medium": 30,   "High": 40  }.get(intensity, 30)
        alpha   = epsilon / 8

        adv = img_tensor.clone().detach()

        for _ in range(steps):
            adv.requires_grad_(True)

            loss_parts = []

            # Proxy 1: crop-based (antelopev2-aligned face region)
            if has_face:
                emb_crop = emb_from_tensor(crop_differentiable(adv, *crop_coords))
                sim_crop = torch.nn.functional.cosine_similarity(emb_crop, orig_emb_crop)
                loss_parts.append(0.65 * sim_crop.mean())

            # Proxy 2: global resize (legacy VGGFace2 approach)
            emb_global = emb_from_tensor(adv)
            sim_global = torch.nn.functional.cosine_similarity(emb_global, orig_emb_global)
            w_global = 0.35 if has_face else 1.0
            loss_parts.append(w_global * sim_global.mean())

            loss = sum(loss_parts)
            loss.backward()

            with torch.no_grad():
                adv = adv - alpha * adv.grad.sign()
                delta = torch.clamp(adv - img_tensor, -epsilon, epsilon)
                adv = torch.clamp(img_tensor + delta, 0.0, 1.0).detach()

        final_sim = loss.item()
        print(f"[Layer 1] PGD complete. Final combined cosine sim: {final_sim:.4f}")

        del facenet
        torch.cuda.empty_cache()

        res_np = adv.cpu().squeeze(0).permute(1, 2, 0).numpy()
        return Image.fromarray((res_np * 255).astype(np.uint8))

    def _apply_layer_mimicry(self, img: Image.Image, intensity: str) -> Image.Image:
        """Layer 2: Style Poison — dual CLIP proxy PGD.

        Proxy 1 (primary): OpenCLIP ViT-H/14 (laion2b_s32b_b79k) — SDXL/IP-Adapter image encoder class
        Proxy 2 (legacy):  CLIP ViT-L/14 (openai) — classic image retrieval proxy

        Note: targets CLIP-based tools (image retrieval, IP-Adapter image conditioning).
        Style LoRA protection is handled primarily by Layer 3 (VAE latent disruption).
        """
        import torch
        import numpy as np
        import torchvision.transforms as T

        print("[Layer 2] Applying Style Poison v3 (dual-CLIP: ViT-H/14 + ViT-L/14)...")
        torch.cuda.empty_cache()
        device = "cuda" if torch.cuda.is_available() else "cpu"

        # CLIP standard normalisation (same for both models)
        normalizer = T.Normalize(
            mean=[0.48145466, 0.4578275, 0.40821073],
            std=[0.26862954, 0.26130258, 0.27577711]
        )
        resizer = T.Resize((224, 224), interpolation=T.InterpolationMode.BICUBIC, antialias=True)

        img_np = np.array(img).astype(np.float32) / 255.0
        img_tensor = torch.tensor(img_np).permute(2, 0, 1).unsqueeze(0).to(device)  # [1,3,H,W]

        # --- Load Proxy 1: OpenCLIP ViT-H/14 ---
        has_clip_h = False
        orig_emb_h = None
        clip_h = None
        try:
            import open_clip
            clip_h, _, _ = open_clip.create_model_and_transforms(
                'ViT-H-14', pretrained='laion2b_s32b_b79k'
            )
            clip_h = clip_h.to(device).eval()
            for p in clip_h.parameters():
                p.requires_grad = False
            with torch.no_grad():
                orig_emb_h = clip_h.encode_image(normalizer(resizer(img_tensor)))
            has_clip_h = True
            print("[Layer 2] OpenCLIP ViT-H/14 loaded.")
        except Exception as e:
            print(f"[Layer 2] OpenCLIP ViT-H/14 warning: {e}. Continuing with ViT-L/14 only.")

        # --- Load Proxy 2: CLIP ViT-L/14 ---
        has_clip_l = False
        orig_emb_l = None
        clip_l = None
        try:
            from transformers import CLIPModel
            clip_l = CLIPModel.from_pretrained("openai/clip-vit-large-patch14").to(device)
            for p in clip_l.parameters():
                p.requires_grad = False
            with torch.no_grad():
                orig_emb_l = clip_l.get_image_features(normalizer(resizer(img_tensor)))
            has_clip_l = True
            print("[Layer 2] CLIP ViT-L/14 loaded.")
        except Exception as e:
            print(f"[Layer 2] CLIP ViT-L/14 warning: {e}.")

        if not has_clip_h and not has_clip_l:
            print("[Layer 2] All CLIP models failed — using simple noise fallback.")
            return self._simple_noise_fallback(img)

        # --- PGD settings ---
        epsilon = {"Low": 0.03, "Medium": 0.05, "High": 0.08}.get(intensity, 0.05)
        steps   = 40
        alpha   = epsilon / 10

        adv = img_tensor.clone().detach()

        for _ in range(steps):
            adv.requires_grad_(True)
            processed = normalizer(resizer(adv))

            loss_parts = []
            if has_clip_h:
                emb_h = clip_h.encode_image(processed)
                sim_h = torch.nn.functional.cosine_similarity(emb_h, orig_emb_h)
                loss_parts.append(0.6 * sim_h.mean())
            if has_clip_l:
                emb_l = clip_l.get_image_features(processed)
                sim_l = torch.nn.functional.cosine_similarity(emb_l, orig_emb_l)
                w = 0.4 if has_clip_h else 1.0
                loss_parts.append(w * sim_l.mean())

            loss = sum(loss_parts)
            loss.backward()

            with torch.no_grad():
                adv = adv - alpha * adv.grad.sign()
                delta = torch.clamp(adv - img_tensor, -epsilon, epsilon)
                adv = torch.clamp(img_tensor + delta, 0.0, 1.0).detach()

        print(f"[Layer 2] Style Poison final loss: {loss.item():.4f}")

        if clip_h is not None:
            del clip_h
        if clip_l is not None:
            del clip_l
        torch.cuda.empty_cache()

        res_np = adv.cpu().squeeze(0).permute(1, 2, 0).numpy()
        return Image.fromarray((res_np * 255).astype(np.uint8))

    def _simple_noise_fallback(self, img):
        import numpy as np
        img_np = np.array(img).astype(float)
        noise = np.random.normal(0, 10.0, img_np.shape)
        img_poisoned = np.clip(img_np + noise, 0, 255).astype(np.uint8)
        return Image.fromarray(img_poisoned)

    def _apply_layer_editing(self, img: Image.Image, intensity: str = "Medium") -> Image.Image:
        """Layer 3: Edit Immunity — dual-VAE PGD.

        Proxy 1 (primary): FLUX VAE (16-channel, bfloat16) — targets FLUX-based LoRA/editing
        Proxy 2 (legacy):  SD 1.5 VAE (4-channel, float32) — targets SD 1.5/2.x pipelines

        Combined PGD loss: 0.65 * loss_flux + 0.35 * loss_sd15
        Both VAEs share the same perturbation variable and ε-ball.
        """
        import torch
        import numpy as np
        import torchvision.transforms as T
        from diffusers import AutoencoderKL

        print("[Layer 3] Applying Edit Immunity v3 (dual-VAE PGD: FLUX + SD1.5)...")
        torch.cuda.empty_cache()
        device = "cuda" if torch.cuda.is_available() else "cpu"

        epsilon = {"Low": 0.03, "Medium": 0.06, "High": 0.10}.get(intensity, 0.06)
        steps   = 20
        alpha   = epsilon / 5

        orig_w, orig_h = img.width, img.height
        resize_512  = T.Resize((512, 512), interpolation=T.InterpolationMode.BICUBIC, antialias=True)
        restore_orig = T.Resize((orig_h, orig_w), interpolation=T.InterpolationMode.BICUBIC, antialias=True)

        img_np = np.array(img).astype(np.float32) / 127.5 - 1.0  # [0,255] → [-1,1]
        img_tensor = torch.from_numpy(img_np).permute(2, 0, 1).unsqueeze(0).to(device)  # float32
        img_512 = resize_512(img_tensor)

        # --- Load FLUX VAE (primary, 16-channel) ---
        has_flux = False
        flux_vae = None
        z_flux_orig = None
        try:
            flux_vae = AutoencoderKL.from_pretrained(
                "black-forest-labs/FLUX.1-schnell",
                subfolder="vae",
                torch_dtype=torch.float32,
            ).to(device)
            flux_vae.eval()
            for p in flux_vae.parameters():
                p.requires_grad = False
            with torch.no_grad():
                z_flux_orig = flux_vae.encode(img_512).latent_dist.mean  # [1,16,64,64]
            has_flux = True
            print("[Layer 3] FLUX VAE (16-ch) loaded.")
        except Exception as e:
            print(f"[Layer 3] FLUX VAE warning: {e}. Continuing with SD1.5 VAE only.")

        # --- Load SD 1.5 VAE (legacy, 4-channel) ---
        has_sd15 = False
        sd15_vae = None
        z_sd15_orig = None
        try:
            sd15_vae = AutoencoderKL.from_pretrained(
                "/models/stable-diffusion-v1-5",
                subfolder="vae",
                torch_dtype=torch.float32,
            ).to(device)
            sd15_vae.eval()
            for p in sd15_vae.parameters():
                p.requires_grad = False
            with torch.no_grad():
                z_sd15_orig = sd15_vae.encode(img_512).latent_dist.mean  # [1,4,64,64]
            has_sd15 = True
            print("[Layer 3] SD 1.5 VAE (4-ch) loaded.")
        except Exception as e:
            print(f"[Layer 3] SD 1.5 VAE warning: {e}.")

        if not has_flux and not has_sd15:
            raise RuntimeError("[Layer 3] Both VAEs failed to load — cannot apply Edit Immunity.")

        adv = img_512.clone().detach()

        for _ in range(steps):
            adv.requires_grad_(True)

            loss_parts = []
            if has_flux:
                z_flux_adv = flux_vae.encode(adv).latent_dist.mean
                loss_flux = -torch.mean((z_flux_adv - z_flux_orig) ** 2)
                loss_parts.append(0.65 * loss_flux)
            if has_sd15:
                z_sd15_adv = sd15_vae.encode(adv).latent_dist.mean
                loss_sd15 = -torch.mean((z_sd15_adv - z_sd15_orig) ** 2)
                w = 0.35 if has_flux else 1.0
                loss_parts.append(w * loss_sd15)

            loss = sum(loss_parts)
            loss.backward()

            with torch.no_grad():
                adv = adv - alpha * adv.grad.sign()
                delta = torch.clamp(adv - img_512, -epsilon, epsilon)
                adv = torch.clamp(img_512 + delta, -1.0, 1.0).detach()

        # Log final disruption
        with torch.no_grad():
            dist_info = []
            if has_flux:
                fd = torch.mean((flux_vae.encode(adv).latent_dist.mean - z_flux_orig) ** 2).item()
                dist_info.append(f"FLUX L2={fd:.4f}")
            if has_sd15:
                sd = torch.mean((sd15_vae.encode(adv).latent_dist.mean - z_sd15_orig) ** 2).item()
                dist_info.append(f"SD15 L2={sd:.4f}")
        print(f"[Layer 3] PGD complete. {' | '.join(dist_info)}")

        if flux_vae is not None:
            del flux_vae
        if sd15_vae is not None:
            del sd15_vae
        torch.cuda.empty_cache()

        adv_orig = restore_orig(adv)
        adv_np = ((adv_orig.squeeze(0).permute(1, 2, 0).cpu().numpy() + 1.0) * 127.5)
        adv_np = adv_np.clip(0, 255).astype(np.uint8)
        return Image.fromarray(adv_np)

    def _apply_layer_watermark(self, img: Image.Image, text: str) -> Image.Image:
        """Layer 4: Invisible Watermark — TrustMark neural steganographic encoding.

        TrustMark-C embeds a 100-bit steganographic payload, robust against JPEG,
        cropping, and mild adversarial filtering. Replaces DWT/DCT which is trivially
        stripped by diffusion purification.
        """
        from trustmark import TrustMark

        print(f"[Layer 4] Embedding TrustMark watermark: '{text}'")
        try:
            tm = TrustMark(verbose=False, model_type='C')
            # TrustMark requires RGB mode — convert defensively (prior layers always return RGB
            # but guard against skipped layers handing a palette/RGBA image)
            img_rgb = img.convert('RGB')
            # TrustMark.encode(img_pil, string_payload) → returns watermarked PIL Image
            watermarked = tm.encode(img_rgb, text)
            print("[Layer 4] TrustMark encoding complete.")
            return watermarked
        except Exception as e:
            print(f"[Layer 4] TrustMark error: {e}")
            raise

    @modal.method()
    def run_shield_pipeline(self, request: ProtectionRequest) -> ProtectionJobResult:
        start_time = time.time()
        print(f"[Shield] Starting Pipeline for {request.artwork_id}")
        
        # Track ID
        job_id = "unknown"
        try:
            from modal import current_function_call_id
            job_id = current_function_call_id()
            if job_id:
                job_states[job_id] = {"status": "PROCESSING", "steps": []}
        except:
            pass

        steps_log: List[StepResult] = []
        
        def log_step(step: StepResult):
            steps_log.append(step)
            if job_id and job_id != "unknown":
                try:
                    current_state = job_states.get(job_id, {})
                    current_state.update({
                        "status": "PROCESSING", 
                        "steps": [s.dict() for s in steps_log]
                    })
                    job_states[job_id] = current_state
                except Exception as e:
                    print(f"Failed to update job state: {e}")

        current_img = None
        original_img_bytes = None
        
        try:
            # 0. Load Original
            original_img = self._download_image(request.image_url)
            current_img = original_img.copy()
            original_img_bytes = self._img_to_bytes(original_img)

            # --- Config ---
            intensity = request.config.get("intensity", "Medium")
            watermark_text = request.config.get("watermark_text", "DRIMIT SHIELD")

            # --- Path Prefix ---
            if request.image_r2_key:
                # Strip filename: "{userId}/{sha256}/original.ext" → "{userId}/{sha256}"
                path_prefix = request.image_r2_key.rsplit("/", 1)[0]
            else:
                import hashlib
                folder_hash = hashlib.sha256(
                    f"{request.user_id}_{request.artwork_id}".encode()
                ).hexdigest()[:16]
                path_prefix = f"protected/{request.user_id}/{folder_hash}"

            # --- Upload original reference for dual-run verification baseline ---
            original_ref_key = f"{path_prefix}/verification/original_reference.png"
            self._upload_to_r2(original_img_bytes, original_ref_key, is_preview=request.is_preview)
            original_r2_url = f"{request.r2_public_base_url}/{original_ref_key}"
            print(f"[Shield] Original reference uploaded: {original_ref_key}")

            # --- LAYER 1: IDENTITY ---
            if request.use_identity_shield:
                t0 = time.time()
                try:
                    current_img = self._apply_layer_identity(current_img, intensity)

                    step1_key = f"{path_prefix}/verification/layer_1_identity.png"
                    self._upload_to_r2(self._img_to_bytes(current_img), step1_key, is_preview=request.is_preview)
                    step1_url = f"{request.r2_public_base_url}/{step1_key}"

                    # v3: pass original_url for dual-run baseline
                    verify_res = simulation_engine.verify_identity.remote(step1_url, original_r2_url)

                    log_step(StepResult(
                        step_name="layer_1_identity",
                        status=verify_res.get("status", "FAIL"),
                        r2_key=step1_key,
                        verification_meta=verify_res,
                        duration_ms=(time.time() - t0) * 1000
                    ))
                except Exception as e:
                    print(f"Layer 1 Failed: {e}")
                    log_step(StepResult(
                        step_name="layer_1_identity",
                        status="FAIL",
                        error=str(e)
                    ))
            else:
                 log_step(StepResult(
                    step_name="layer_1_identity",
                    status="SKIPPED",
                    duration_ms=0
                ))

            # --- LAYER 2: MIMICRY (Style Poison) ---
            if request.use_style_poison:
                t0 = time.time()
                try:
                    current_img = self._apply_layer_mimicry(current_img, intensity)

                    step2_key = f"{path_prefix}/verification/layer_2_mimicry.png"
                    self._upload_to_r2(self._img_to_bytes(current_img), step2_key, is_preview=request.is_preview)
                    step2_url = f"{request.r2_public_base_url}/{step2_key}"

                    # v3: use original_r2_url (already on R2) instead of raw image_url
                    verify_res = simulation_engine.verify_style.remote(step2_url, original_r2_url)
                    
                    log_step(StepResult(
                        step_name="layer_2_mimicry",
                        status=verify_res.get("status", "FAIL"),
                        r2_key=step2_key,
                        verification_meta=verify_res,
                        duration_ms=(time.time() - t0) * 1000
                    ))
                except Exception as e:
                    print(f"Layer 2 Failed: {e}")
                    log_step(StepResult(
                        step_name="layer_2_mimicry",
                        status="FAIL",
                        error=str(e)
                    ))
            else:
                 log_step(StepResult(
                    step_name="layer_2_mimicry",
                    status="SKIPPED",
                    duration_ms=0
                ))

            # --- LAYER 3: EDITING (Immunization) ---
            if request.use_edit_immunity:
                t0 = time.time()
                try:
                    current_img = self._apply_layer_editing(current_img, intensity)

                    step3_key = f"{path_prefix}/verification/layer_3_editing.png"
                    self._upload_to_r2(self._img_to_bytes(current_img), step3_key, is_preview=request.is_preview)
                    step3_url = f"{request.r2_public_base_url}/{step3_key}"

                    # v3: pass original_url + path_prefix so simulation can upload r2_key_original
                    verify_res = simulation_engine.verify_editing.remote(
                        step3_url, original_r2_url, path_prefix, request.is_preview
                    )

                    log_step(StepResult(
                        step_name="layer_3_editing",
                        status=verify_res.get("status", "FAIL"),
                        r2_key=step3_key,
                        r2_key_original=verify_res.get("r2_key_original"),  # NEW in v3
                        verification_meta=verify_res,
                        duration_ms=(time.time() - t0) * 1000
                    ))
                except Exception as e:
                    print(f"Layer 3 Failed: {e}")
                    log_step(StepResult(
                        step_name="layer_3_editing",
                        status="FAIL",
                        error=str(e)
                    ))
            else:
                 log_step(StepResult(
                    step_name="layer_3_editing",
                    status="SKIPPED",
                    duration_ms=0
                ))

            # --- LAYER 4: WATERMARK ---
            if request.use_watermark:
                t0 = time.time()
                try:
                    current_img = self._apply_layer_watermark(current_img, watermark_text)

                    step4_key = f"{path_prefix}/verification/layer_4_watermark.png"
                    self._upload_to_r2(self._img_to_bytes(current_img), step4_key, is_preview=request.is_preview)
                    step4_url = f"{request.r2_public_base_url}/{step4_key}"

                    # v3: pass original_url for baseline + watermark_text as expected payload
                    verify_res = simulation_engine.verify_watermark.remote(
                        step4_url, original_r2_url, watermark_text
                    )
                    
                    log_step(StepResult(
                        step_name="layer_4_watermark",
                        status=verify_res.get("status", "FAIL"),
                        r2_key=step4_key,
                        verification_meta=verify_res,
                        duration_ms=(time.time() - t0) * 1000
                    ))
                except Exception as e:
                    print(f"Layer 4 Failed: {e}")
                    log_step(StepResult(
                        step_name="layer_4_watermark",
                        status="FAIL",
                        error=str(e)
                    ))
            else:
                 log_step(StepResult(
                    step_name="layer_4_watermark",
                    status="SKIPPED",
                    duration_ms=0
                ))

            # --- FINALIZE & SCORE ---
            final_key = f"{path_prefix}/protected.png"
            self._upload_to_r2(self._img_to_bytes(current_img), final_key, is_preview=request.is_preview)
            final_url = f"{request.r2_public_base_url}/{final_key}"
            
            total_time = (time.time() - start_time) * 1000
            job_status = "COMPLETED"
            
            # Compute Aggregated Shield Score
            # Each layer is 25% of the score (4 layers)
            total_score = 0.0
            
            for step in steps_log:
                step_score = 0.0
                meta = step.verification_meta
                
                # Normalize metrics to 0-1
                if step.status == "PASS":
                     # Base pass score
                     step_score = 1.0 
                     
                     # Add granularity if available
                     if "protection_score" in meta:
                         step_score = float(meta["protection_score"])
                     elif "confidence" in meta: # Identity (inverse)
                         step_score = 1.0 - float(meta["confidence"])
                         
                if step.status == "FAIL":
                    step_score = 0.0
                
                total_score += step_score

            # Normalize to 0-100
            shield_score = min(max((total_score / 4.0) * 100, 0), 100)
            print(f"[Shield] Calculated Score: {shield_score:.2f} / 100")

            result = ProtectionJobResult(
                artwork_id=str(request.artwork_id),
                status=job_status,
                original_image_url=request.image_url,
                final_url=final_url,
                steps=steps_log,
                total_duration_ms=total_time,
                shield_score=shield_score,
                protection_field={"epsilon": 0.05}
            )
            
            # Final Status Update
            if job_id and job_id != "unknown":
                job_states[job_id] = {
                    "status": "COMPLETED", 
                    "result": result.dict(),
                    "steps": [s.dict() for s in steps_log]
                }
            
            print(f"[Shield] Pipeline Completed. Status: {job_status}")
            return result

        except Exception as e:
            print(f"[Shield] Critical Error: {e}")
            if job_id and job_id != "unknown":
                job_states[job_id] = {"status": "FAILED", "error": str(e)}
            
            return ProtectionJobResult(
                artwork_id=str(request.artwork_id),
                status="FAILED",
                original_image_url=request.image_url,
                total_duration_ms=(time.time() - start_time) * 1000,
                error_message=str(e)
            )

# FastAPI Integration
from fastapi import FastAPI, HTTPException, BackgroundTasks, Request as FastAPIRequest
from fastapi.responses import JSONResponse

web_app = FastAPI()

def _verify_token(request: FastAPIRequest):
    auth = request.headers.get("Authorization", "")
    token = auth.removeprefix("Bearer ").strip()
    expected = os.environ.get("MODAL_AUTH_TOKEN", "")
    if not expected or token != expected:
        raise HTTPException(status_code=401, detail="Unauthorized")

@web_app.post("/protect")
async def start_protection_job(http_request: FastAPIRequest, request: ProtectionRequest):
    _verify_token(http_request)
    print(f"[API] Received protection request for {request.artwork_id}")
    try:
        # Spawn the job asynchronously using the Modal function
        # We need to call `.spawn()` on the class method.
        # However, `ProtectionKernel` is a class. We usually instantiate it?
        # Modal class methods can be called with `Kernel().method.spawn(...)`
        
        job = ProtectionKernel().run_shield_pipeline.spawn(request)
        job_id = job.object_id
        
        # Store state
        state_data = {"status": "QUEUED", "artwork_id": request.artwork_id, "steps": []}
        job_states[job_id] = state_data
        
        # Map artwork_id -> job_id
        job_map[str(request.artwork_id)] = job_id
        
        return JSONResponse(content={"job_id": job_id, "status": "QUEUED"})
    except Exception as e:
        print(f"[API] Error spawning job: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class StatusRequest(BaseModel):
    artwork_ids: List[str]

@web_app.post("/status")
async def check_bulk_status(http_request: FastAPIRequest, request: StatusRequest):
    _verify_token(http_request)
    """
    Called by PipelineService.syncRunningJobs with { artwork_ids: [...] }
    Returns { artwork_id: { status: str, result: dict } }
    """
    response_map = {}
    
    for artwork_id in request.artwork_ids:
        # Find active job for this artwork
        try:
            job_id = job_map.get(str(artwork_id))
            if not job_id:
                # Not found or already expired
                response_map[artwork_id] = {"status": "none"}
                continue
                
            state = job_states.get(job_id)
            if not state:
                response_map[artwork_id] = {"status": "lost"}
                continue
                
            # Construct response matching legacy format expected by PipelineService
            status_lower = state.get("status", "processing").lower()
            
            # Map Python status to expected Next.js format
            # Next.js expects: "completed", "failed", "processing", "queued"
            
            result_payload = {}
            if status_lower == "completed":
                result_payload = state.get("result", {})
                
            # If processing, include partial steps for V2 UI
            if status_lower == "processing" or status_lower == "queued":
                result_payload["steps"] = state.get("steps", [])
            
            response_map[artwork_id] = {
                "status": status_lower,
                "result": result_payload
            }
            
        except Exception as e:
            print(f"Error checking status for {artwork_id}: {e}")
            response_map[artwork_id] = {"status": "error", "error": str(e)}

    return JSONResponse(content=response_map)
    

@web_app.get("/status/{job_id}")
async def check_status(job_id: str):
    try:
        # Check Modal Function Call Status
        # Usually we need `modal.functions.FunctionCall.from_id(job_id).get(timeout=0)`
        # But that blocks? No, `get` blocks until done. `get(timeout=0)` might raise TimeoutError?
        # Better: Check our `job_states` or use `get_call_graph`?
        # For simplicity in this demo, we rely on the client polling.
        # If we use `.get()`, it waits. We want non-blocking status check.
        # But Modal doesn't have a simple "is_running?" API exposed inside the function easily without overhead for every poll.
        
        # ACTUALLY: The standard way is to have the function update `job_states` as it progresses!
        # But my `run_shield_pipeline` doesn't write to `job_states`.
        # I should update `run_shield_pipeline` to write progress? for now, let's just create a wrapper.
        
        # Since I can't easily modify `run_shield_pipeline` mid-execution from here effectively without re-deploying logic that writes to Dict,
        # I will assume the `.get()` method integration in the client (Node.js) handles waiting?
        # NO, the Node.js client polls THIS endpoint.
        # So THIS endpoint needs to know the status.
        
        # Retrieving the result:
        try:
            fc = modal.functions.FunctionCall.from_id(job_id)
            # Try to get result with very short timeout
            result = fc.get(timeout=0.01) 
            # If we get here, it's done!
            return JSONResponse(content={"status": "COMPLETED", "result": result.dict()})
        except TimeoutError:
            return JSONResponse(content={"status": "PROCESSING"})
        except Exception as e:
            # Could be "function failed"
            return JSONResponse(content={"status": "FAILED", "error": str(e)})

    except Exception as e:
         raise HTTPException(status_code=404, detail="Job not found")

@app.function(image=kernel_image, secrets=[modal.Secret.from_name("shield-secret")])
@modal.asgi_app()
def fastapi_app():
    return web_app

# Entrypoint for local testing or manual trigger
@app.local_entrypoint()
def main():
    print("Use 'modal serve modal/protection/main.py' to deploy.")
