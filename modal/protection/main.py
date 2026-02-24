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
    from diffusers import StableDiffusionImg2ImgPipeline
    from facenet_pytorch import InceptionResnetV1
    
    # 1. Mist Models (SD 1.5 - Backcompat / Edit Immunity)
    print("Downloading Stable Diffusion v1-5 (Mist)...")
    model_id = "runwayml/stable-diffusion-v1-5"
    if torch.cuda.is_available():
        pipe = StableDiffusionImg2ImgPipeline.from_pretrained(model_id, torch_dtype=torch.float16, safety_checker=None)
    else:
        pipe = StableDiffusionImg2ImgPipeline.from_pretrained(model_id, safety_checker=None)
    pipe.save_pretrained("/models/stable-diffusion-v1-5")
    
    # 2. Poisoning/Concept (CLIP/SigLIP)
    from transformers import CLIPModel, CLIPProcessor
    print("Downloading CLIP (Poison)...")
    CLIPModel.from_pretrained("openai/clip-vit-large-patch14")
    CLIPProcessor.from_pretrained("openai/clip-vit-large-patch14")
    
    # 3. InsightFace (Deepfake Defense - SOTA)
    print("Downloading InsightFace models...")
    # This caches 'buffalo_l' to ~/.insightface/models/
    try:
        app = insightface.app.FaceAnalysis(name='buffalo_l', providers=['CUDAExecutionProvider'])
        app.prepare(ctx_id=0, det_size=(640, 640))
    except Exception as e:
        print(f"InsightFace download warning (may be OK if cached): {e}")

    # 4. Facenet-PyTorch (Identity Attack Proxy)
    print("Downloading InceptionResnetV1 (Identity Proxy)...")
    # This downloads weights to ~/.cache/torch/hub/checkpoints/
    model = InceptionResnetV1(pretrained='vggface2').eval()
    
kernel_image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install("git", "libgl1", "libglib2.0-0", "wget", "libsm6", "libxext6", "fonts-dejavu-core", "gcc", "g++")
    .pip_install(
        "torch==2.0.1", "torchvision",
        "diffusers==0.24.0", "transformers>=4.39.0",
        "accelerate==0.25.0", "huggingface-hub==0.19.4",
        "numpy<2", "scipy", "safetensors", "opencv-python",
        "pynvml", "ftfy", "tqdm", "fire", "mediapipe",
        "fastapi[standard]", "requests", "Pillow", "boto3", "sentencepiece",
        "invisible-watermark==0.2.0",
        "insightface==0.7.3", "onnxruntime-gpu>=1.16.0",
        "facenet-pytorch"
    )
    .run_function(download_models, gpu="any")
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
        """Layer 1: Identity Shield (SOTA: PGD Attack vs ArcFace/FaceNet)"""
        import torch
        import torch.nn as nn
        import torch.optim as optim
        import numpy as np
        import cv2
        from facenet_pytorch import InceptionResnetV1
        
        print(f"[Layer 1] Applying Identity Shield (Adversarial Noise - Intensity: {intensity})...")
        device = "cuda" if torch.cuda.is_available() else "cpu"
        
        # 1. Load Differentiable Face Model (Proxy for Attack)
        # We use InceptionResnetV1 (VGGFace2) as a strong proxy for Face Recognition
        try:
            model = InceptionResnetV1(pretrained='vggface2').eval().to(device)
            # Freeze params
            for p in model.parameters():
                p.requires_grad = False
        except Exception as e:
            print(f"[Layer 1] Critical Error loading Face Proxy: {e}")
            return img # Fail open if model fails
        
        # 2. Prepare Image
        # FaceNet expects specific normalization
        img_np = np.array(img).astype(np.float32) / 255.0
        # Convert to tensor [1, 3, H, W]
        img_tensor = torch.tensor(img_np).permute(2,0,1).unsqueeze(0).to(device) 
        
        # We need to attack the embedding space.
        # Helper to get embedding from full image (Global Attack Strategy)
        # For robustness, we attack the resized global view. Ideally we'd crop faces, 
        # but a global attack is more robust to different croppers and detectors.
        import torchvision.transforms as T
        resizer = T.Resize((160, 160), antialias=True)
        # Standard normalization for InceptionResnetV1 used in facenet-pytorch
        # (Actually, facenet-pytorch usually uses simple whitening or fixed stats. 
        # Here we follow the standard: (x - 127.5) / 128.0 approx [-1, 1])
        # But our tensor is [0,1]. So (x - 0.5) / 0.5 -> [-1, 1]
        
        def get_embedding(full_img_tensor):
            crops = resizer(full_img_tensor)
            normed = (crops - 0.5) / 0.5 
            return model(normed)

        with torch.no_grad():
            orig_emb = get_embedding(img_tensor)
            
        # PGD Settings
        # Epsilon: Max perturbation (L-inf norm)
        epsilon = 0.03 if intensity == "Low" else (0.07 if intensity == "High" else 0.05)
        alpha = 0.005 # Step size
        steps = 40 if intensity == "High" else 25
        
        input_var = img_tensor.clone().detach()
        input_var.requires_grad = True
        
        optimizer = optim.Adam([input_var], lr=0.01) # Adam can be better than simple SGD for this
        
        for i in range(steps):
            curr_emb = get_embedding(input_var)
            
            # Loss: Maximize distance (Minimize Cosine Similarity)
            # We want sim to be 0 or -1.
            cos_sim = torch.nn.functional.cosine_similarity(curr_emb, orig_emb)
            loss = cos_sim.mean() # Minimize this
            
            model.zero_grad()
            loss.backward()
            
            # Update (Projected Gradient Descent)
            # Gradient Ascent on Distance = Gradient Descent on Similarity
            grad = input_var.grad.data
            # Minimize similarity -> move AGAINST gradient
            input_var.data = input_var.data - alpha * grad.sign()
            
            # Projection
            diff = input_var.data - img_tensor.data
            diff = torch.clamp(diff, -epsilon, epsilon)
            input_var.data = torch.clamp(img_tensor.data + diff, 0, 1)
            
            input_var.grad = None
            
        print(f"[Layer 1] Identity Shield Final Loss (Sim): {loss.item():.4f}")
        
        res_np = input_var.detach().cpu().squeeze(0).permute(1, 2, 0).numpy()
        res_uint8 = (res_np * 255).astype(np.uint8)
        
        # Verify result validity
        return Image.fromarray(res_uint8)

    def _apply_layer_mimicry(self, img: Image.Image, intensity: str) -> Image.Image:
        """Layer 2: Style Poison (Feature Space Perturbation)"""
        import torch
        import torch.nn as nn
        import torch.optim as optim
        from transformers import CLIPModel, CLIPProcessor
        import numpy as np
        
        print("[Layer 2] Applying Style Poison (CLIP-Targeted Adversarial Noise)...")
        # Ensure we have clean memory
        torch.cuda.empty_cache()
        
        device = "cuda" if torch.cuda.is_available() else "cpu"
        
        # 1. Load CLIP (The "Eye" of the AI we want to fool)
        # Using openai/clip-vit-large-patch14 as standard reference
        model_id = "openai/clip-vit-large-patch14"
        try:
            model = CLIPModel.from_pretrained(model_id).to(device)
            # Freeze extraction backbone
            for p in model.parameters():
                p.requires_grad = False
        except Exception as e:
            # Fallback if download fails inside loop (should be pre-downloaded)
            print(f"Warning: CLIP load failed ({e}), skipping style poison.")
            return img

        # 2. Prepare Inputs
        # Convert Image to Tensor for Optimization
        # We process inputs manually to maintain gradients
        
        # Standardize input
        import torchvision.transforms as T
        # CLIP Standard normalization
        normalizer = T.Normalize(mean=[0.48145466, 0.4578275, 0.40821073], 
                                 std=[0.26862954, 0.26130258, 0.27577711])
        resizer = T.Resize((224, 224), interpolation=T.InterpolationMode.BICUBIC, antialias=True)
        
        # Original Input for reference (Loss Target: Maximize distance from this)
        # Convert [0,1] tensor first
        img_np = np.array(img).astype(np.float32) / 255.0
        img_tensor = torch.tensor(img_np).permute(2,0,1).unsqueeze(0).to(device) # [1,3,H,W]
        
        with torch.no_grad():
            proc_init = normalizer(resizer(img_tensor))
            original_embedding = model.get_image_features(proc_init)
        
        # Intensity settings (Adversarial Budget)
        epsilon = 0.03 if intensity == "Low" else (0.08 if intensity == "High" else 0.05)
        steps = 40 
        alpha = epsilon / 10 # Heuristic step size
        
        # PGD Loop
        adv_tensor = img_tensor.clone().detach()
        adv_tensor.requires_grad = True
        
        optimizer = optim.Adam([adv_tensor], lr=0.01)
        
        for i in range(steps):
            # 1. Forward Pass (Resize -> Normalize -> CLIP)
            # We resize inside loop to make the perturbation robust to resizing (AOT)
            processed = normalizer(resizer(adv_tensor))
            
            # 2. Extract Features
            current_embedding = model.get_image_features(processed)
            
            # 3. Calculate Loss (Cosine Similarity)
            # We want to MINIMIZE similarity (Make it different semantically)
            cos_sim = torch.nn.functional.cosine_similarity(current_embedding, original_embedding)
            loss = cos_sim.mean() 
            
            # 4. Backward
            model.zero_grad()
            loss.backward()
            
            # 5. Update (Gradient Descent on Similarity = Gradient Ascent on Distance)
            grad = adv_tensor.grad.data
            adv_tensor.data = adv_tensor.data - alpha * grad.sign()
            
            # 6. Projection (Clamp to epsilon ball)
            diff = adv_tensor.data - img_tensor.data
            diff = torch.clamp(diff, -epsilon, epsilon)
            adv_tensor.data = torch.clamp(img_tensor.data + diff, 0, 1)
            
            adv_tensor.grad = None
            
        print(f"[Layer 2] Style Poison Final Loss (Similarity): {loss.item():.4f}")

        # Convert back
        res_np = adv_tensor.detach().cpu().squeeze(0).permute(1, 2, 0).numpy()
        res_uint8 = (res_np * 255).astype(np.uint8)
        
        return Image.fromarray(res_uint8)

    def _simple_noise_fallback(self, img):
        import numpy as np
        img_np = np.array(img).astype(float)
        noise = np.random.normal(0, 10.0, img_np.shape)
        img_poisoned = np.clip(img_np + noise, 0, 255).astype(np.uint8)
        return Image.fromarray(img_poisoned)

    def _apply_layer_editing(self, img: Image.Image, intensity: str = "Medium") -> Image.Image:
        """Layer 3: Edit Immunity — PGD adversarial attack against the SD VAE encoder.

        Maximises the L2 distance between the original and adversarial latent
        representations, disrupting inpainting / img2img pipelines while keeping
        the visible perturbation within a tight ε-ball.
        """
        import torch
        import numpy as np
        import torchvision.transforms as T
        from diffusers import AutoencoderKL

        print("[Layer 3] Applying Edit Immunity (PGD vs. VAE encoder)...")
        torch.cuda.empty_cache()

        device = "cuda" if torch.cuda.is_available() else "cpu"

        try:
            vae = AutoencoderKL.from_pretrained(
                "/models/stable-diffusion-v1-5",
                subfolder="vae",
                torch_dtype=torch.float32,
            ).to(device)
            vae.eval()
            for p in vae.parameters():
                p.requires_grad = False

            # Intensity → adversarial budget (ε in [-1, 1] space)
            epsilon = {"Low": 0.03, "Medium": 0.06, "High": 0.10}.get(intensity, 0.06)
            steps = 20
            alpha = epsilon / 5

            # Resize to 512×512 for VAE, keep originals for restoration
            orig_w, orig_h = img.width, img.height
            resize_512 = T.Resize((512, 512), interpolation=T.InterpolationMode.BICUBIC, antialias=True)
            restore_orig = T.Resize((orig_h, orig_w), interpolation=T.InterpolationMode.BICUBIC, antialias=True)

            img_np = np.array(img).astype(np.float32) / 127.5 - 1.0  # [0,255] → [-1,1]
            img_tensor = torch.from_numpy(img_np).permute(2, 0, 1).unsqueeze(0).to(device)
            img_512 = resize_512(img_tensor)

            with torch.no_grad():
                z_orig = vae.encode(img_512).latent_dist.mean  # [1,4,64,64]

            adv = img_512.clone().detach()

            for _ in range(steps):
                adv.requires_grad_(True)
                z_adv = vae.encode(adv).latent_dist.mean
                # Maximise latent L2 distance (negate to turn into a minimisation)
                loss = -torch.mean((z_adv - z_orig) ** 2)
                loss.backward()
                with torch.no_grad():
                    adv = adv - alpha * adv.grad.sign()
                    delta = torch.clamp(adv - img_512, -epsilon, epsilon)
                    adv = torch.clamp(img_512 + delta, -1.0, 1.0).detach()

            final_dist = torch.mean((z_orig - vae.encode(adv).latent_dist.mean) ** 2).item()
            print(f"[Layer 3] PGD complete. Latent L2 distance: {final_dist:.4f}")

            del vae
            torch.cuda.empty_cache()

            adv_orig = restore_orig(adv)
            adv_np = ((adv_orig.squeeze(0).permute(1, 2, 0).cpu().numpy() + 1.0) * 127.5)
            adv_np = adv_np.clip(0, 255).astype(np.uint8)
            return Image.fromarray(adv_np)

        except Exception as e:
            print(f"[Layer 3] PGD failed ({e}), falling back to noise approximation.")
            return self._simple_noise_fallback(img)

    def _apply_layer_watermark(self, img: Image.Image, text: str) -> Image.Image:
        """Layer 4: Invisible Watermark (Provenance)"""
        print(f"[Layer 4] Embedding Watermark: {text}")
        
        try:
            import numpy as np
            from imwatermark import WatermarkEncoder
            import cv2
            
            # 1. Convert PIL to OpenCV (BGR)
            img_np = np.array(img)
            img_bgr = cv2.cvtColor(img_np, cv2.COLOR_RGB2BGR)
            
            # 2. Configure Encoder (DWTDct is robust)
            encoder = WatermarkEncoder()
            
            # 3. Payload: Using first 32 chars of text (UUID) or hash
            # invisible-watermark bytes limits exist. Hex string is safe.
            payload_bytes = text.encode('utf-8')[:32]
            
            encoder.set_watermark('bytes', payload_bytes)
            
            # 4. Embed
            img_encoded_bgr = encoder.encode(img_bgr, 'dwtDct')
            
            # 5. Convert back to RGB
            img_encoded_rgb = cv2.cvtColor(img_encoded_bgr, cv2.COLOR_BGR2RGB)
            
            return Image.fromarray(img_encoded_rgb)
            
        except ImportError:
            print("Warning: invisible-watermark not installed, skipping.")
            return img
        except Exception as e:
            print(f"Watermark Error: {e}")
            return img

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
            
            # Path Prefix Construction
            # Standard: {userId}/{artworkId}/... 
            # (Using artwork_id as the 'hash' for folder structure consistency if real hash not provided)
            
            # Extract basic path from input URL if possible to reuse folder?
            # Input: .../uploads/{userId}/{uuid}-{filename}
            # We want Output: jobs/{userId}/{artworkId}/...
            
            # However, user requested strict structure: {userId}/{hash}/...
            # Let's align with that.
            
            # Compute output path prefix.
            # New convention: {userId}/{sha256} (mirrors the original upload path)
            # This makes the protected image land at {userId}/{sha256}/protected.png,
            # which the frontend infers directly from artwork.r2Key.
            if request.image_r2_key:
                # Strip filename: "{userId}/{sha256}/original.ext" → "{userId}/{sha256}"
                path_prefix = request.image_r2_key.rsplit("/", 1)[0]
            else:
                # Backward-compat fallback for calls without image_r2_key
                import hashlib
                folder_hash = hashlib.sha256(
                    f"{request.user_id}_{request.artwork_id}".encode()
                ).hexdigest()[:16]
                path_prefix = f"protected/{request.user_id}/{folder_hash}"


            # --- LAYER 1: IDENTITY ---
            if request.use_identity_shield:
                t0 = time.time()
                try:
                    current_img = self._apply_layer_identity(current_img, intensity)
                    
                    # Verification / Step Artifacts
                    step1_key = f"{path_prefix}/verification/layer_1_identity.png"
                    self._upload_to_r2(self._img_to_bytes(current_img), step1_key, is_preview=request.is_preview)
                    step1_url = f"{request.r2_public_base_url}/{step1_key}"
                    
                    verify_res = simulation_engine.verify_identity.remote(step1_url)
                    
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
            # Needs to run if selected, uses layer 1 output
            if request.use_style_poison:
                t0 = time.time()
                try:
                    current_img = self._apply_layer_mimicry(current_img, intensity)
                    
                    step2_key = f"{path_prefix}/verification/layer_2_mimicry.png"
                    self._upload_to_r2(self._img_to_bytes(current_img), step2_key, is_preview=request.is_preview)
                    step2_url = f"{request.r2_public_base_url}/{step2_key}"
                    
                    # Pass original URL for comparison
                    verify_res = simulation_engine.verify_style.remote(step2_url, request.image_url)
                    
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
                    
                    verify_res = simulation_engine.verify_editing.remote(step3_url)
                    
                    log_step(StepResult(
                        step_name="layer_3_editing",
                        status=verify_res.get("status", "FAIL"),
                        r2_key=step3_key,
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
                    # Provide Artwork ID as the payload
                    current_img = self._apply_layer_watermark(current_img, request.artwork_id)
                    
                    step4_key = f"{path_prefix}/verification/layer_4_watermark.png"
                    self._upload_to_r2(self._img_to_bytes(current_img), step4_key, is_preview=request.is_preview)
                    step4_url = f"{request.r2_public_base_url}/{step4_key}"
                    
                    verify_res = simulation_engine.verify_watermark.remote(step4_url, request.artwork_id)
                    
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
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse

web_app = FastAPI()

@web_app.post("/protect")
async def start_protection_job(request: ProtectionRequest):
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
async def check_bulk_status(request: StatusRequest):
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
