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
# Art type detection categories and per-type layer configuration
ART_TYPE_LAYER_CONFIG = {
    "photography_portrait": {
        "l1_scale": 1.5,  # Face protection is primary threat
        "l2_scale": 0.5,  # Style less relevant for photos
        "l3_scale": 1.0,
        "l4_scale": 1.0,
        "attack_labels": {
            "l1": "Deepfake / FaceSwap Attack",
            "l2": "CLIP Reverse Image Search",
            "l3": "AI Image Editing",
            "l4": "Attribution Evasion",
        },
    },
    "photography_other": {
        "l1_scale": 0.3,  # Faces usually absent
        "l2_scale": 0.8,
        "l3_scale": 1.0,
        "l4_scale": 1.0,
        "attack_labels": {
            "l1": "Face Extraction",
            "l2": "CLIP Retrieval",
            "l3": "AI Manipulation",
            "l4": "Attribution Evasion",
        },
    },
    "painting": {
        "l1_scale": 0.5,
        "l2_scale": 1.5,  # Style imitation is primary threat
        "l3_scale": 1.5,  # LoRA/FLUX editing is primary threat
        "l4_scale": 1.0,
        "attack_labels": {
            "l1": "Face Reference Extraction",
            "l2": "Style Imitation (LoRA / DreamBooth)",
            "l3": "AI Restoration / Editing",
            "l4": "Attribution Evasion",
        },
    },
    "digital_art": {
        "l1_scale": 0.8,
        "l2_scale": 1.4,
        "l3_scale": 1.3,
        "l4_scale": 1.0,
        "attack_labels": {
            "l1": "Character Reference Extraction",
            "l2": "Style Training (LoRA / IP-Adapter)",
            "l3": "AI Editing / Inpainting",
            "l4": "Attribution Evasion",
        },
    },
    "illustration": {
        "l1_scale": 0.5,
        "l2_scale": 1.4,
        "l3_scale": 1.2,
        "l4_scale": 1.0,
        "attack_labels": {
            "l1": "Character Face Extraction",
            "l2": "Style Imitation (LoRA)",
            "l3": "AI Style Adaptation",
            "l4": "Attribution Evasion",
        },
    },
    "drawing": {
        "l1_scale": 0.3,
        "l2_scale": 1.3,
        "l3_scale": 1.1,
        "l4_scale": 1.0,
        "attack_labels": {
            "l1": "Face Sketch Reference",
            "l2": "Style Training",
            "l3": "AI Vectorization / Upscaling",
            "l4": "Attribution Evasion",
        },
    },
    "cartoon_anime": {
        "l1_scale": 0.7,
        "l2_scale": 1.4,
        "l3_scale": 1.2,
        "l4_scale": 1.0,
        "attack_labels": {
            "l1": "Character Face Swap",
            "l2": "Style Training (LoRA / DreamBooth)",
            "l3": "Style Transfer Attack",
            "l4": "Attribution Evasion",
        },
    },
    "unknown": {
        "l1_scale": 1.0,
        "l2_scale": 1.0,
        "l3_scale": 1.0,
        "l4_scale": 1.0,
        "attack_labels": {
            "l1": "Identity Attack",
            "l2": "Style Attack",
            "l3": "Editing Attack",
            "l4": "Attribution Evasion",
        },
    },
}

R2_BUCKET_PROD = "drimit-shield-bucket"
R2_BUCKET_DEV = "drimit-shield-dev-bucket"

# App Declaration
app = modal.App("drimit-shield-kernel")

# Reference Simulation (instantiated at runtime, not module load time)
_SimulationEngineCls = modal.Cls.from_name("drimit-shield-simulation", "SimulationEngine")

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

    # HF login — required for gated models (e.g. FLUX VAE)
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
        from pathlib import Path
        import insightface.utils.storage as ifs
        antelopev2_dir = Path.home() / ".insightface" / "models" / "antelopev2"
        if not (antelopev2_dir / "glintr100.onnx").exists():
            ifs.download("antelopev2", force=False)
            print(f"antelopev2 downloaded to {antelopev2_dir}")
        app_v2 = insightface.app.FaceAnalysis(name='antelopev2', providers=['CUDAExecutionProvider'])
        app_v2.prepare(ctx_id=0, det_size=(640, 640))
        print("antelopev2 cached successfully.")
    except Exception as e:
        print(f"InsightFace antelopev2 warning: {e}")

    # 6. InceptionResnetV1/VGGFace2 (L1 primary differentiable proxy)
    print("Downloading InceptionResnetV1 (VGGFace2 primary proxy)...")
    InceptionResnetV1(pretrained='vggface2').eval()

    # 6b. InceptionResnetV1/CASIA-WebFace (L1 3rd proxy — different training set, broader coverage)
    print("Downloading InceptionResnetV1 (CASIA-WebFace 3rd proxy)...")
    InceptionResnetV1(pretrained='casia-webface').eval()

    # 6c. SigLIP SO400M-patch14-384 (L2 new primary proxy — Google 2024, 400M params)
    # Different feature space than CLIP (sigmoid loss, 384px input) — attacks FLUX/SD3-era LoRA training
    print("Downloading SigLIP SO400M-patch14-384 (Layer 2 primary) ...")
    try:
        from transformers import SiglipModel
        SiglipModel.from_pretrained("google/siglip-so400m-patch14-384")
        print("SigLIP SO400M cached successfully.")
    except Exception as e:
        print(f"SigLIP SO400M warning: {e}")

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

    # 7b. SD3.5 Large VAE (Layer 3 3rd proxy — 16-channel, modern Stability AI encoder)
    # Different architecture from FLUX VAE — covers SD3.x/ComfyUI SD3 editing pipelines
    # Requires accepting the SD3.5 license on HuggingFace (gated model)
    print("Downloading SD3.5 Large VAE (Layer 3 3rd proxy) ...")
    try:
        AutoencoderKL.from_pretrained(
            "stabilityai/stable-diffusion-3.5-large",
            subfolder="vae",
            torch_dtype=torch.float32,
        )
        print("SD3.5 Large VAE cached successfully.")
    except Exception as e:
        print(f"SD3.5 VAE warning: {e}")

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
            print(f"[R2] ↑ {bucket} / {key} ({len(image_bytes)/1024:.0f}KB)")
            return key
        except Exception as e:
            print(f"[R2] ✗ Upload failed → {bucket}/{key}: {e}")
            return None

    def _scale_intensity(self, intensity: str, scale: float) -> str:
        """Scale intensity up or down based on art-type relevance of a layer."""
        levels = ["Low", "Medium", "High"]
        idx = levels.index(intensity) if intensity in levels else 1
        if scale >= 1.4:
            idx = min(idx + 1, 2)
        elif scale <= 0.4:
            idx = max(idx - 1, 0)
        return levels[idx]

    def detect_art_type(self, img: Image.Image) -> Dict[str, Any]:
        """Classify image art type using CLIP zero-shot (7 categories).

        Returns: {art_type, confidence, has_face, all_scores, layer_config, attack_labels}
        Uses CLIP ViT-L/14 (already cached), optionally confirms portrait via antelopev2.
        """
        import torch
        import cv2
        import numpy as np
        import insightface
        from transformers import CLIPModel, CLIPProcessor

        categories = {
            "photography_portrait": "a portrait photograph of a real human person, realistic photo",
            "photography_other": "a realistic landscape or object photograph, nature, street photo",
            "painting": "an oil painting or watercolor painting, traditional fine art canvas",
            "digital_art": "digital art, digital illustration, concept art, CG rendered art",
            "illustration": "book illustration, editorial illustration, graphic illustration",
            "drawing": "a pencil sketch or charcoal drawing, line art, hand-drawn sketch",
            "cartoon_anime": "anime, cartoon, manga style art, animated character",
        }

        try:
            device = "cuda" if torch.cuda.is_available() else "cpu"
            clip = CLIPModel.from_pretrained("openai/clip-vit-large-patch14").to(device)
            proc = CLIPProcessor.from_pretrained("openai/clip-vit-large-patch14")

            texts = list(categories.values())
            labels = list(categories.keys())
            inputs = proc(text=texts, images=img, return_tensors="pt", padding=True).to(device)
            with torch.no_grad():
                outputs = clip(**inputs)
                probs = outputs.logits_per_image.softmax(dim=-1)[0].cpu().tolist()

            del clip
            torch.cuda.empty_cache()

            all_scores = {labels[i]: round(probs[i], 3) for i in range(len(labels))}
            best_idx = max(range(len(probs)), key=lambda i: probs[i])
            art_type = labels[best_idx]
            confidence = probs[best_idx]

            # Confirm portrait via face detection when CLIP is uncertain or predicts portrait
            has_face = False
            if art_type in ("photography_portrait", "cartoon_anime", "illustration") or confidence < 0.40:
                try:
                    providers = ["CUDAExecutionProvider"] if torch.cuda.is_available() else ["CPUExecutionProvider"]
                    app_v2 = insightface.app.FaceAnalysis(name="antelopev2", providers=providers)
                    app_v2.prepare(ctx_id=0, det_size=(640, 640))
                    img_bgr = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
                    faces = app_v2.get(img_bgr)
                    has_face = len(faces) > 0
                    del app_v2
                    # If face found but CLIP didn't pick portrait → promote
                    if has_face and art_type not in ("photography_portrait", "cartoon_anime", "illustration", "digital_art"):
                        art_type = "photography_portrait"
                        confidence = max(confidence, 0.55)
                        print(f"[ArtType] Promoted to photography_portrait via face detection")
                except Exception as e:
                    print(f"[ArtType] Face detection warning: {e}")

            layer_cfg = ART_TYPE_LAYER_CONFIG.get(art_type, ART_TYPE_LAYER_CONFIG["unknown"])
            print(f"[ArtType] ✓ {art_type} (conf={confidence:.0%}) has_face={has_face} | l1_scale={layer_cfg['l1_scale']} l2_scale={layer_cfg['l2_scale']} l3_scale={layer_cfg['l3_scale']}")
            print(f"[ArtType] Scores: {all_scores}")

            return {
                "art_type": art_type,
                "confidence": confidence,
                "has_face": has_face,
                "all_scores": all_scores,
                "layer_config": layer_cfg,
                "attack_labels": layer_cfg["attack_labels"],
            }
        except Exception as e:
            print(f"[ArtType] ✗ Detection failed: {e} — defaulting to unknown")
            cfg = ART_TYPE_LAYER_CONFIG["unknown"]
            return {"art_type": "unknown", "confidence": 0.0, "has_face": False, "all_scores": {}, "layer_config": cfg, "attack_labels": cfg["attack_labels"]}

    def _download_image(self, url):
        headers = {"User-Agent": "Mozilla/5.0"}
        # /api/assets/ routes require Bearer auth (same token used for /protect)
        auth_token = os.environ.get("MODAL_AUTH_TOKEN", "")
        if auth_token and "/api/assets/" in url:
            headers["Authorization"] = f"Bearer {auth_token}"
        r = requests.get(url, headers=headers, stream=True)
        r.raise_for_status()
        img = Image.open(io.BytesIO(r.content)).convert("RGB")
        print(f"[SHIELD] ↓ Image loaded {img.width}×{img.height}px ← {'...'+url[-60:] if len(url)>80 else url}")
        return img

    def _img_to_bytes(self, img: Image.Image, format="PNG") -> bytes:
        buf = io.BytesIO()
        img.save(buf, format=format)
        return buf.getvalue()

    # --- ATOMIC LAYERS ---

    def _apply_layer_identity(self, img: Image.Image, intensity: str, use_legacy: bool = True) -> Image.Image:
        """Layer 1: Identity Shield — triple-proxy PGD.

        Proxy 1 (crop):    antelopev2 face bbox → differentiable affine crop → InceptionResnetV1/VGGFace2
        Proxy 2 (global):  InceptionResnetV1/VGGFace2 on full 160×160 resize
        Proxy 3 (casia):   InceptionResnetV1/CASIA-WebFace on full 160×160 — different training set
        Loss (face found): 0.50 * crop_vgg + 0.25 * global_vgg + 0.25 * global_casia
        Loss (no face):    0.50 * global_vgg + 0.50 * global_casia
        """
        import torch
        import torch.nn.functional as F
        import numpy as np
        import cv2
        import torchvision.transforms as T
        from facenet_pytorch import InceptionResnetV1
        import insightface

        print(f"[L1|Identity] ▶ Applying Identity Shield v4 (triple-proxy PGD, intensity={intensity})")
        torch.cuda.empty_cache()
        device = "cuda" if torch.cuda.is_available() else "cpu"

        # --- Load differentiable proxies ---
        try:
            facenet = InceptionResnetV1(pretrained='vggface2').eval().to(device)
            for p in facenet.parameters():
                p.requires_grad = False
        except Exception as e:
            print(f"[L1|Identity] ✗ CRITICAL: InceptionResnetV1/VGGFace2 load failed: {e}")
            return img

        facenet_casia = None
        try:
            facenet_casia = InceptionResnetV1(pretrained='casia-webface').eval().to(device)
            for p in facenet_casia.parameters():
                p.requires_grad = False
            print("[L1|Identity] ⚙ InceptionResnetV1/CASIA-WebFace loaded (Proxy 3)")
        except Exception as e:
            print(f"[L1|Identity] ⚠ CASIA-WebFace proxy load failed: {e} — continuing with dual proxy")

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
                print(f"[L1|Identity] ✓ antelopev2 face detected — bbox=({x1},{y1},{x2},{y2}) using dual-proxy loss (0.65×crop + 0.35×global)")
            del app_v2
        except Exception as e:
            print(f"[L1|Identity] ⚙ antelopev2 no face / warning: {e} — falling back to global-only loss (1.0×global)")

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
            orig_emb_casia = None
            if facenet_casia is not None:
                def emb_from_tensor_casia(t):
                    cropped = resizer_160(t)
                    normed = (cropped - 0.5) / 0.5
                    return facenet_casia(normed)
                orig_emb_casia = emb_from_tensor_casia(img_tensor)
            if has_face:
                orig_emb_crop = emb_from_tensor(
                    crop_differentiable(img_tensor, *crop_coords)
                )

        # --- PGD settings ---
        epsilon = {"Low": 0.03, "Medium": 0.05, "High": 0.07}.get(intensity, 0.05)
        steps   = {"Low": 20,   "Medium": 30,   "High": 40  }.get(intensity, 30)
        alpha   = epsilon / 8
        print(f"[L1|Identity] ⚡ PGD config — ε={epsilon:.3f} steps={steps} α={alpha:.5f}")

        adv = img_tensor.clone().detach()

        for _ in range(steps):
            adv.requires_grad_(True)

            loss_parts = []
            has_casia = orig_emb_casia is not None

            # Proxy 1: crop-based VGGFace2 (antelopev2-aligned face region)
            if has_face:
                emb_crop = emb_from_tensor(crop_differentiable(adv, *crop_coords))
                sim_crop = torch.nn.functional.cosine_similarity(emb_crop, orig_emb_crop)
                loss_parts.append(0.50 * sim_crop.mean())

            # Proxy 2: global VGGFace2
            if use_legacy or not has_face:
                emb_global = emb_from_tensor(adv)
                sim_global = torch.nn.functional.cosine_similarity(emb_global, orig_emb_global)
                if has_face:
                    w_global = 0.25 if has_casia else 0.50
                else:
                    w_global = 0.50 if has_casia else 1.0
                loss_parts.append(w_global * sim_global.mean())

            # Proxy 3: global CASIA-WebFace (different training data — broader coverage)
            if has_casia:
                emb_casia = emb_from_tensor_casia(adv)
                sim_casia = torch.nn.functional.cosine_similarity(emb_casia, orig_emb_casia)
                w_casia = 0.25 if has_face else 0.50
                loss_parts.append(w_casia * sim_casia.mean())

            loss = sum(loss_parts)
            loss.backward()

            with torch.no_grad():
                adv = adv - alpha * adv.grad.sign()
                delta = torch.clamp(adv - img_tensor, -epsilon, epsilon)
                adv = torch.clamp(img_tensor + delta, 0.0, 1.0).detach()

        final_sim = loss.item()
        print(f"[L1|Identity] ✓ PGD complete — final_cosine_sim={final_sim:.4f}")

        del facenet
        torch.cuda.empty_cache()

        res_np = adv.cpu().squeeze(0).permute(1, 2, 0).numpy()
        return Image.fromarray((res_np * 255).astype(np.uint8))

    def _apply_layer_mimicry(self, img: Image.Image, intensity: str, use_legacy: bool = True) -> Image.Image:
        """Layer 2: Style Poison — triple-proxy CLIP PGD.

        Proxy 1 (primary):   SigLIP SO400M-patch14-384 (Google 2024) — sigmoid loss, 384px, targets FLUX/SD3 era
        Proxy 2 (secondary): OpenCLIP ViT-H/14 (laion2b_s32b_b79k) — SDXL/IP-Adapter encoder class
        Proxy 3 (legacy):    CLIP ViT-L/14 (openai) — classic retrieval proxy (disabled if use_legacy=False)
        Combined loss: 0.50 * siglip + 0.30 * clip_h + 0.20 * clip_l

        Note: targets CLIP-based tools (image retrieval, IP-Adapter conditioning, LoRA feature extraction).
        Style LoRA protection is handled primarily by Layer 3 (VAE latent disruption).
        """
        import torch
        import numpy as np
        import torchvision.transforms as T

        print(f"[L2|StylePoison] ▶ Applying Style Poison v4 (triple-proxy: SigLIP + ViT-H/14 + ViT-L/14, intensity={intensity})")
        torch.cuda.empty_cache()
        device = "cuda" if torch.cuda.is_available() else "cpu"

        # CLIP standard normalisation (Proxy 2 + 3)
        normalizer_clip = T.Normalize(
            mean=[0.48145466, 0.4578275, 0.40821073],
            std=[0.26862954, 0.26130258, 0.27577711]
        )
        resizer_224 = T.Resize((224, 224), interpolation=T.InterpolationMode.BICUBIC, antialias=True)
        # SigLIP normalisation (Proxy 1 — different from CLIP)
        normalizer_siglip = T.Normalize(mean=[0.5, 0.5, 0.5], std=[0.5, 0.5, 0.5])
        resizer_384 = T.Resize((384, 384), interpolation=T.InterpolationMode.BICUBIC, antialias=True)

        img_np = np.array(img).astype(np.float32) / 255.0
        img_tensor = torch.tensor(img_np).permute(2, 0, 1).unsqueeze(0).to(device)  # [1,3,H,W]

        # --- Load Proxy 1: SigLIP SO400M-patch14-384 (new primary) ---
        has_siglip = False
        orig_emb_siglip = None
        siglip = None
        try:
            from transformers import SiglipModel
            siglip = SiglipModel.from_pretrained("google/siglip-so400m-patch14-384").to(device).eval()
            for p in siglip.parameters():
                p.requires_grad = False
            with torch.no_grad():
                orig_emb_siglip = siglip.get_image_features(
                    pixel_values=normalizer_siglip(resizer_384(img_tensor))
                )
            has_siglip = True
            print("[L2|StylePoison] ⚙ SigLIP SO400M loaded (Proxy 1 — primary)")
        except Exception as e:
            print(f"[L2|StylePoison] ⚠ SigLIP failed: {e} — falling back to OpenCLIP primary")

        # --- Load Proxy 2: OpenCLIP ViT-H/14 ---
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
                orig_emb_h = clip_h.encode_image(normalizer_clip(resizer_224(img_tensor)))
            has_clip_h = True
            print("[L2|StylePoison] ⚙ OpenCLIP ViT-H/14 loaded (Proxy 2)")
        except Exception as e:
            print(f"[L2|StylePoison] ⚠ OpenCLIP ViT-H/14 failed: {e}")

        # --- Load Proxy 3: CLIP ViT-L/14 (legacy — skip if use_legacy=False) ---
        has_clip_l = False
        orig_emb_l = None
        clip_l = None
        if use_legacy:
            try:
                from transformers import CLIPModel
                clip_l = CLIPModel.from_pretrained("openai/clip-vit-large-patch14").to(device)
                for p in clip_l.parameters():
                    p.requires_grad = False
                with torch.no_grad():
                    orig_emb_l = clip_l.get_image_features(normalizer_clip(resizer_224(img_tensor)))
                has_clip_l = True
                print("[L2|StylePoison] ⚙ CLIP ViT-L/14 loaded (Proxy 3 — legacy)")
            except Exception as e:
                print(f"[L2|StylePoison] ⚠ CLIP ViT-L/14 failed: {e}")
        else:
            print("[L2|StylePoison] ⚙ CLIP ViT-L/14 skipped (legacy disabled)")

        if not has_siglip and not has_clip_h and not has_clip_l:
            print("[L2|StylePoison] ✗ All vision models failed — using simple noise fallback")
            return self._simple_noise_fallback(img)

        n_proxies = sum([has_siglip, has_clip_h, has_clip_l])
        # --- PGD settings ---
        epsilon = {"Low": 0.03, "Medium": 0.05, "High": 0.08}.get(intensity, 0.05)
        steps   = {"Low": 30, "Medium": 40, "High": 60}.get(intensity, 40)
        alpha   = epsilon / 10
        print(f"[L2|StylePoison] ⚡ PGD config — ε={epsilon:.3f} steps={steps} α={alpha:.5f} proxies={n_proxies}/3")

        adv = img_tensor.clone().detach()

        for _ in range(steps):
            adv.requires_grad_(True)
            loss_parts = []

            # Proxy 1: SigLIP (0.50 primary weight)
            if has_siglip:
                emb_s = siglip.get_image_features(
                    pixel_values=normalizer_siglip(resizer_384(adv))
                )
                sim_s = torch.nn.functional.cosine_similarity(emb_s, orig_emb_siglip)
                w_s = 0.50 if has_clip_h else (0.70 if has_clip_l else 1.0)
                loss_parts.append(w_s * sim_s.mean())

            # Proxy 2: OpenCLIP ViT-H/14 (0.30 weight when all 3 active)
            if has_clip_h:
                processed_224 = normalizer_clip(resizer_224(adv))
                emb_h = clip_h.encode_image(processed_224)
                sim_h = torch.nn.functional.cosine_similarity(emb_h, orig_emb_h)
                w_h = (0.30 if has_siglip else 0.60) if has_clip_l else (0.50 if has_siglip else 1.0)
                loss_parts.append(w_h * sim_h.mean())

            # Proxy 3: CLIP ViT-L/14 (0.20 legacy weight)
            if has_clip_l:
                if not has_clip_h:
                    processed_224 = normalizer_clip(resizer_224(adv))
                emb_l = clip_l.get_image_features(processed_224)
                sim_l = torch.nn.functional.cosine_similarity(emb_l, orig_emb_l)
                w_l = 0.20 if (has_siglip or has_clip_h) else 1.0
                loss_parts.append(w_l * sim_l.mean())

            loss = sum(loss_parts)
            loss.backward()

            with torch.no_grad():
                adv = adv - alpha * adv.grad.sign()
                delta = torch.clamp(adv - img_tensor, -epsilon, epsilon)
                adv = torch.clamp(img_tensor + delta, 0.0, 1.0).detach()

        print(f"[L2|StylePoison] ✓ PGD complete — final_loss={loss.item():.4f}")

        if siglip is not None:
            del siglip
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

    def _apply_layer_editing(self, img: Image.Image, intensity: str = "Medium", use_legacy: bool = True) -> Image.Image:
        """Layer 3: Edit Immunity — triple-VAE PGD.

        Proxy 1 (primary):   FLUX VAE (16-channel, float32) — targets FLUX.1/Kontext-era pipelines
        Proxy 2 (secondary): SD3.5 Large VAE (16-channel) — modern Stability AI encoder, covers SD3.x
        Proxy 3 (legacy):    SD 1.5 VAE (4-channel) — targets SD 1.5/2.x pipelines (disabled if use_legacy=False)

        Combined PGD loss: 0.50 * loss_flux + 0.30 * loss_sd35 + 0.20 * loss_sd15
        All VAEs share the same perturbation variable and ε-ball.
        """
        import torch
        import numpy as np
        import torchvision.transforms as T
        from diffusers import AutoencoderKL

        print(f"[L3|EditImmunity] ▶ Applying Edit Immunity v4 (triple-VAE PGD: FLUX+SD3.5+SD1.5, intensity={intensity})")
        torch.cuda.empty_cache()
        device = "cuda" if torch.cuda.is_available() else "cpu"

        epsilon = {"Low": 0.03, "Medium": 0.06, "High": 0.10}.get(intensity, 0.06)
        steps   = {"Low": 20, "Medium": 30, "High": 40}.get(intensity, 30)
        alpha   = epsilon / 5
        print(f"[L3|EditImmunity] ⚡ PGD config — ε={epsilon:.3f} steps={steps} α={alpha:.5f}")

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
            print(f"[L3|EditImmunity] ⚙ FLUX VAE (16-ch) loaded — z_orig.shape={list(z_flux_orig.shape)}")
        except Exception as e:
            print(f"[L3|EditImmunity] ⚠ FLUX VAE load failed: {e} — SD1.5 only")

        # --- Load SD3.5 Large VAE (secondary, 16-channel — different arch from FLUX) ---
        has_sd35 = False
        sd35_vae = None
        z_sd35_orig = None
        try:
            sd35_vae = AutoencoderKL.from_pretrained(
                "stabilityai/stable-diffusion-3.5-large",
                subfolder="vae",
                torch_dtype=torch.float32,
            ).to(device)
            sd35_vae.eval()
            for p in sd35_vae.parameters():
                p.requires_grad = False
            with torch.no_grad():
                z_sd35_orig = sd35_vae.encode(img_512).latent_dist.mean
            has_sd35 = True
            print(f"[L3|EditImmunity] ⚙ SD3.5 Large VAE (16-ch) loaded — z_orig.shape={list(z_sd35_orig.shape)}")
        except Exception as e:
            print(f"[L3|EditImmunity] ⚠ SD3.5 VAE load failed: {e} — continuing without")

        # --- Load SD 1.5 VAE (legacy, 4-channel — skip if use_legacy=False) ---
        has_sd15 = False
        sd15_vae = None
        z_sd15_orig = None
        if use_legacy:
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
                print(f"[L3|EditImmunity] ⚙ SD 1.5 VAE (4-ch) loaded — z_orig.shape={list(z_sd15_orig.shape)}")
            except Exception as e:
                print(f"[L3|EditImmunity] ⚠ SD 1.5 VAE load failed: {e}")
        else:
            print("[L3|EditImmunity] ⚙ SD 1.5 VAE skipped (legacy disabled)")

        if not has_flux and not has_sd35 and not has_sd15:
            raise RuntimeError("[Layer 3] All VAEs failed to load — cannot apply Edit Immunity.")

        adv = img_512.clone().detach()

        for _ in range(steps):
            adv.requires_grad_(True)

            loss_parts = []
            n_active = sum([has_flux, has_sd35, has_sd15])

            if has_flux:
                z_flux_adv = flux_vae.encode(adv).latent_dist.mean
                loss_flux = -torch.mean((z_flux_adv - z_flux_orig) ** 2)
                w_flux = 0.50 if n_active == 3 else (0.65 if n_active == 2 else 1.0)
                loss_parts.append(w_flux * loss_flux)

            if has_sd35:
                z_sd35_adv = sd35_vae.encode(adv).latent_dist.mean
                loss_sd35 = -torch.mean((z_sd35_adv - z_sd35_orig) ** 2)
                w_sd35 = 0.30 if has_flux else (0.65 if has_sd15 else 1.0)
                loss_parts.append(w_sd35 * loss_sd35)

            if has_sd15:
                z_sd15_adv = sd15_vae.encode(adv).latent_dist.mean
                loss_sd15 = -torch.mean((z_sd15_adv - z_sd15_orig) ** 2)
                w_sd15 = 0.20 if (has_flux or has_sd35) else 1.0
                loss_parts.append(w_sd15 * loss_sd15)

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
            if has_sd35:
                d35 = torch.mean((sd35_vae.encode(adv).latent_dist.mean - z_sd35_orig) ** 2).item()
                dist_info.append(f"SD35 L2={d35:.4f}")
            if has_sd15:
                sd = torch.mean((sd15_vae.encode(adv).latent_dist.mean - z_sd15_orig) ** 2).item()
                dist_info.append(f"SD15 L2={sd:.4f}")
        print(f"[L3|EditImmunity] ✓ PGD complete — {' | '.join(dist_info)}")

        if flux_vae is not None:
            del flux_vae
        if sd35_vae is not None:
            del sd35_vae
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

        print(f"[L4|Watermark] ▶ Embedding TrustMark-C — payload='{text}' ({len(text.encode())} bytes)")
        try:
            tm = TrustMark(verbose=False, model_type='C')
            # TrustMark requires RGB mode — convert defensively (prior layers always return RGB
            # but guard against skipped layers handing a palette/RGBA image)
            img_rgb = img.convert('RGB')
            # TrustMark.encode(img_pil, string_payload) → returns watermarked PIL Image
            watermarked = tm.encode(img_rgb, text)
            print("[L4|Watermark] ✓ TrustMark encoding complete")
            return watermarked
        except Exception as e:
            print(f"[L4|Watermark] ✗ TrustMark error: {e}")
            raise

    @modal.method()
    def run_shield_pipeline(self, request: ProtectionRequest) -> ProtectionJobResult:
        start_time = time.time()
        enabled = [k for k, v in [("L1",request.use_identity_shield),("L2",request.use_style_poison),("L3",request.use_edit_immunity),("L4",request.use_watermark)] if v]
        print(f"[SHIELD] ▶ Pipeline start — artwork={request.artwork_id} user={request.user_id} layers={'+'.join(enabled)} intensity={request.config.get('intensity','Medium')} preview={request.is_preview}")
        
        # Track ID
        job_id = "unknown"
        try:
            from modal import current_function_call_id
            job_id = current_function_call_id()
            if job_id:
                job_states[job_id] = {"status": "PROCESSING", "steps": []}
        except:
            pass

        # Instantiate simulation engine at runtime (Modal Cls must be instantiated inside a function)
        simulation_engine = _SimulationEngineCls()

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
                    print(f"[SHIELD] ⚠ Job state update failed ({job_id}): {e}")

        current_img = None
        original_img_bytes = None
        
        try:
            # 0. Load Original
            original_img = self._download_image(request.image_url)
            current_img = original_img.copy()
            original_img_bytes = self._img_to_bytes(original_img)

            # --- Config ---
            intensity = request.config.get("intensity", "Medium")
            watermark_text = request.config.get("watermark_text", "DRIMIT")
            identity_legacy = bool(request.config.get("identity_legacy", True))
            mimicry_legacy  = bool(request.config.get("mimicry_legacy", True))
            editing_legacy  = bool(request.config.get("editing_legacy", True))
            print(f"[SHIELD] Legacy proxies: L1={identity_legacy} L2={mimicry_legacy} L3={editing_legacy}")

            # --- Art Type Detection (before any protection layers) ---
            art_type_result = self.detect_art_type(original_img)
            art_type = art_type_result["art_type"]
            layer_cfg = art_type_result["layer_config"]
            attack_labels = art_type_result["attack_labels"]
            # Scale per-layer intensities based on art type
            i1 = self._scale_intensity(intensity, layer_cfg["l1_scale"])
            i2 = self._scale_intensity(intensity, layer_cfg["l2_scale"])
            i3 = self._scale_intensity(intensity, layer_cfg["l3_scale"])
            i4 = intensity  # watermark always at base intensity
            print(f"[SHIELD] Art type: {art_type} | intensity overrides: L1={i1} L2={i2} L3={i3} L4={i4}")

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
            print(f"[SHIELD] ↑ Original reference → R2: {original_ref_key}")

            # --- LAYER 1: IDENTITY ---
            if request.use_identity_shield:
                t0 = time.time()
                try:
                    current_img = self._apply_layer_identity(current_img, i1, identity_legacy)

                    step1_key = f"{path_prefix}/verification/layer_1_identity.png"
                    self._upload_to_r2(self._img_to_bytes(current_img), step1_key, is_preview=request.is_preview)
                    step1_url = f"{request.r2_public_base_url}/{step1_key}"
                    print(f"[L1|Identity] ↑ Artifact saved → {step1_key}")
                    print(f"[L1|Identity] ▶ Dispatching verify_identity → SimulationEngine (protected={step1_url[-50:]}, original={original_r2_url[-50:]})")

                    # v3: pass original_url for dual-run baseline
                    verify_res = simulation_engine.verify_identity.remote(step1_url, original_r2_url, path_prefix, request.is_preview, art_type)

                    log_step(StepResult(
                        step_name="layer_1_identity",
                        status=verify_res.get("status", "FAIL"),
                        r2_key=verify_res.get("r2_key") or step1_key,
                        r2_key_original=verify_res.get("r2_key_original"),
                        verification_meta=verify_res,
                        duration_ms=(time.time() - t0) * 1000
                    ))
                    print(f"[L1|Identity] ✓ verify done — status={verify_res.get('status')} faces={verify_res.get('faces_detected')} confidence={verify_res.get('confidence',0):.3f} drop={verify_res.get('confidence_drop',0):.3f}")
                except Exception as e:
                    print(f"[L1|Identity] ✗ Layer failed: {e}")
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
                    current_img = self._apply_layer_mimicry(current_img, i2, mimicry_legacy)

                    step2_key = f"{path_prefix}/verification/layer_2_mimicry.png"
                    self._upload_to_r2(self._img_to_bytes(current_img), step2_key, is_preview=request.is_preview)
                    step2_url = f"{request.r2_public_base_url}/{step2_key}"
                    print(f"[L2|StylePoison] ↑ Artifact saved → {step2_key}")
                    print(f"[L2|StylePoison] ▶ Dispatching verify_style → SimulationEngine (protected={step2_url[-50:]}, original={original_r2_url[-50:]})")

                    # v3: use original_r2_url (already on R2) instead of raw image_url
                    verify_res = simulation_engine.verify_style.remote(step2_url, original_r2_url, path_prefix, request.is_preview, art_type)

                    log_step(StepResult(
                        step_name="layer_2_mimicry",
                        status=verify_res.get("status", "FAIL"),
                        r2_key=verify_res.get("r2_key") or step2_key,
                        r2_key_original=verify_res.get("r2_key_original"),
                        verification_meta=verify_res,
                        duration_ms=(time.time() - t0) * 1000
                    ))
                    print(f"[L2|StylePoison] ✓ verify done — status={verify_res.get('status')} style_sim={verify_res.get('style_similarity',0):.4f} flux_drift={verify_res.get('flux_vae_latent_drift',0):.4f} psnr={verify_res.get('visual_quality_psnr',0):.1f}dB")
                except Exception as e:
                    print(f"[L2|StylePoison] ✗ Layer failed: {e}")
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
                    current_img = self._apply_layer_editing(current_img, i3, editing_legacy)

                    step3_key = f"{path_prefix}/verification/layer_3_editing.png"
                    self._upload_to_r2(self._img_to_bytes(current_img), step3_key, is_preview=request.is_preview)
                    step3_url = f"{request.r2_public_base_url}/{step3_key}"
                    print(f"[L3|EditImmunity] ↑ Artifact saved → {step3_key}")
                    print(f"[L3|EditImmunity] ▶ Dispatching verify_editing → SimulationEngine (protected={step3_url[-50:]}, original={original_r2_url[-50:]})")

                    # v3: pass original_url + path_prefix so simulation can upload r2_key_original
                    verify_res = simulation_engine.verify_editing.remote(
                        step3_url, original_r2_url, path_prefix, request.is_preview, art_type
                    )

                    log_step(StepResult(
                        step_name="layer_3_editing",
                        status=verify_res.get("status", "FAIL"),
                        r2_key=step3_key,
                        r2_key_original=verify_res.get("r2_key_original"),  # NEW in v3
                        verification_meta=verify_res,
                        duration_ms=(time.time() - t0) * 1000
                    ))
                    print(f"[L3|EditImmunity] ✓ verify done — status={verify_res.get('status')} artifacts={verify_res.get('artifacts_metric',0):.0f} flux_disruption={verify_res.get('flux_latent_disruption',0):.4f}")
                except Exception as e:
                    print(f"[L3|EditImmunity] ✗ Layer failed: {e}")
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
                    print(f"[L4|Watermark] ↑ Artifact saved → {step4_key}")
                    print(f"[L4|Watermark] ▶ Dispatching verify_watermark → SimulationEngine (protected={step4_url[-50:]}, original={original_r2_url[-50:]})")

                    # v3: pass original_url for baseline + watermark_text as expected payload
                    verify_res = simulation_engine.verify_watermark.remote(
                        step4_url, original_r2_url, watermark_text, path_prefix, request.is_preview, art_type
                    )

                    log_step(StepResult(
                        step_name="layer_4_watermark",
                        status=verify_res.get("status", "FAIL"),
                        r2_key=verify_res.get("r2_key") or step4_key,
                        r2_key_original=verify_res.get("r2_key_original"),
                        verification_meta=verify_res,
                        duration_ms=(time.time() - t0) * 1000
                    ))
                    print(f"[L4|Watermark] ✓ verify done — status={verify_res.get('status')} detected={verify_res.get('watermark_detected')} decoded='{verify_res.get('decoded_uuid','')}' robustness={verify_res.get('robustness_score',0):.0%}")
                except Exception as e:
                    print(f"[L4|Watermark] ✗ Layer failed: {e}")
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
            print(f"[SHIELD] ⚡ Shield Score: {shield_score:.1f}/100 (steps: {[(s.step_name,s.status) for s in steps_log]})")

            result = ProtectionJobResult(
                artwork_id=str(request.artwork_id),
                status=job_status,
                original_image_url=request.image_url,
                final_url=final_url,
                steps=steps_log,
                total_duration_ms=total_time,
                shield_score=shield_score,
                protection_field={"epsilon": 0.05, "art_type": art_type, "art_type_confidence": art_type_result.get("confidence", 0.0), "has_face": art_type_result.get("has_face", False)}
            )
            
            # Final Status Update
            if job_id and job_id != "unknown":
                job_states[job_id] = {
                    "status": "COMPLETED", 
                    "result": result.dict(),
                    "steps": [s.dict() for s in steps_log]
                }
            
            print(f"[SHIELD] ✓ Pipeline completed — status={job_status} duration={total_time/1000:.1f}s score={shield_score:.1f} final_key={final_key}")
            return result

        except Exception as e:
            print(f"[SHIELD] ✗ CRITICAL pipeline error: {e}")
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
    print(f"[API] POST /protect — artwork={request.artwork_id} user={request.user_id} layers=({request.use_identity_shield},{request.use_style_poison},{request.use_edit_immunity},{request.use_watermark}) intensity={request.config.get('intensity','?')}")
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

        print(f"[API] ✓ Job spawned — artwork={request.artwork_id} job_id={job_id}")
        return JSONResponse(content={"job_id": job_id, "status": "QUEUED"})
    except Exception as e:
        print(f"[API] ✗ Spawn failed for artwork={request.artwork_id}: {e}")
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
