import modal
from fastapi import Request, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import io
import os
import time
import hashlib
import uuid
from typing import Dict, Any, Optional, List
from pydantic import BaseModel, Field

# --- Inlined Types ---

class ProtectionRequest(BaseModel):
    image_url: str
    artwork_id: str
    user_id: str
    method: str = "poisoning" 
    config: Dict[str, Any] = {
        "apply_poison": True, # Poison Ivy proper
        "apply_watermark": True, # AI Watermark
        "apply_visual_watermark": False,
        "watermark_text": "DRIMIT SHIELD", 
        "secret_key": None, 
        "epsilon": 0.04,
        "steps": 100,
        "alpha": 0.012,
        "max_res": 3840
    }
    is_preview: bool = False

class ProtectionResult(BaseModel):
    artwork_id: str
    status: str
    original_image_url: str
    protected_image_url: Optional[str] = None
    protected_image_key: Optional[str] = None
    processing_time: float
    file_metadata: Dict[str, Any] = {}
    error_message: Optional[str] = None
    applied_protections: List[str] = []

class BulkStatusRequest(BaseModel):
    artwork_ids: list[str]
    ack_ids: Optional[list[str]] = None

# ---------------------

# Config
R2_BUCKET_PROD = "drimit-shield-bucket"
R2_BUCKET_DEV = "drimit-shield-dev-bucket"

# App Declaration
app = modal.App("drimit-shield-poisoning")

# Persistent state
job_states = modal.Dict.from_name("shield-job-states", create_if_missing=True)

# --- Images ---

# --- Helpers ---

def download_models():
    """Cache models in the image build step."""
    from transformers import CLIPVisionModelWithProjection
    print("Downloading CLIP Model for build cache...")
    CLIPVisionModelWithProjection.from_pretrained("openai/clip-vit-large-patch14")

# Base image for CPU tasks (Orchestration, Watermarking)
cpu_image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install("liblcms2-2", "fonts-dejavu-core")
    .pip_install("Pillow", "requests", "boto3", "numpy<2", "opencv-python-headless", "fastapi[standard]")
)

# Heavy image for GPU tasks (Poison Ivy / PyTorch)
# Optimized: Use pre-built pytorch image to speed up cold starts
gpu_image = (
    modal.Image.from_registry("pytorch/pytorch:2.1.0-cuda12.1-cudnn8-runtime")
    .env({"DEBIAN_FRONTEND": "noninteractive"})
    .apt_install("libgl1", "libglib2.0-0", "liblcms2-2", "git")
    .pip_install(
        "transformers==4.36.2", "accelerate",
        "Pillow", "numpy<2",
        "fastapi", "pydantic", "boto3", "requests"
    )
    .run_function(download_models)
)

auth_scheme = HTTPBearer()

def get_r2_client():
    import boto3
    return boto3.client(
        "s3",
        endpoint_url=os.environ["R2_ENDPOINT"],
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
    )

def apply_ssw_watermark(img_pil, key, alpha):
    """Spread Spectrum Watermarking (CPU)"""
    import cv2
    import numpy as np
    from PIL import Image
    
    if not key:
        return img_pil

    # Convert to numpy
    img_np = np.array(img_pil)
    img_f = img_np.astype(np.float32) / 255.0
    
    # YUV conversion
    yuv = cv2.cvtColor(img_f, cv2.COLOR_RGB2YUV)
    y, u, v = cv2.split(yuv)
    
    dct_y = cv2.dct(y)
    h, w = y.shape
    seed = int(hashlib.sha256(key.encode()).hexdigest(), 16) % (2**32)
    gen = np.random.RandomState(seed)
    
    # Generate noise
    mask = gen.uniform(-1, 1, dct_y.shape).astype(np.float32)
    freq_mask = np.zeros_like(dct_y)
    freq_mask[h//8:h//2, w//8:w//2] = 1 
    
    dct_y_marked = dct_y + (alpha * mask * freq_mask * np.mean(np.abs(dct_y)))
    
    y_res = cv2.idct(dct_y_marked)
    res_yuv = cv2.merge([y_res, u, v])
    res_rgb = cv2.cvtColor(res_yuv, cv2.COLOR_YUV2RGB)
    
    res_uint8 = np.clip(res_rgb * 255.0, 0, 255).astype(np.uint8)
    return Image.fromarray(res_uint8)

def apply_visual_watermark(img_pil, text, opacity=160):
    """Visible Watermark (CPU)"""
    from PIL import Image, ImageDraw, ImageFont
    
    print(f"[VisualWatermark] Applying text: '{text}' (Opacity: {opacity})")
    img = img_pil.convert("RGBA")
    width, height = img.size
    
    txt_layer = Image.new("RGBA", img.size, (255, 255, 255, 0))
    # We don't draw on txt_layer directly until pasting tiles
    
    font_size = int(width * 0.05) # 5% of width
    if font_size < 20: font_size = 20
    
    font = None
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", font_size)
    except Exception as e:
        print(f"[VisualWatermark] Standard font load failed: {e}. Trying fallback.")
        try:
            # Pillow 10+ supports size in load_default
            font = ImageFont.load_default(size=font_size) 
        except:
            # Fallback to tiny font if size param fails (old Pillow)
            font = ImageFont.load_default()
            print("[VisualWatermark] WARNING: Using tiny default font.")

    dummy_draw = ImageDraw.Draw(txt_layer)
    bbox = dummy_draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    
    # Create the Tile (Text + Shadow)
    # Make it large enough for rotation
    angle = 45
    pad = 50
    tile_canvas_w = text_width + pad * 2
    tile_canvas_h = text_height + pad * 2
    
    txt_img = Image.new('RGBA', (tile_canvas_w, tile_canvas_h), (255, 255, 255, 0))
    d = ImageDraw.Draw(txt_img)
    
    # Center text
    tx = pad
    ty = pad
    
    # Shadow (Black)
    shadow_offset = int(font_size * 0.05) + 1
    d.text((tx + shadow_offset, ty + shadow_offset), text, font=font, fill=(0, 0, 0, int(opacity * 0.8)))
    
    # Foreground (White)
    d.text((tx, ty), text, font=font, fill=(255, 255, 255, int(opacity)))
    
    rotated_txt = txt_img.rotate(angle, expand=True, resample=Image.Resampling.BICUBIC)
    
    tile_w, tile_h = rotated_txt.size
    gap_x = int(tile_w * 1.5)
    gap_y = int(tile_h * 1.5)
    
    # Tiling Logic
    for y in range(-tile_h, height + tile_h, gap_y):
        # Stagger rows
        row_idx = y // gap_y
        row_offset = (gap_x // 2) if (row_idx % 2 == 1) else 0
        
        for x in range(-tile_w - row_offset, width + tile_w, gap_x):
            # Paste using alpha composite behavior via mask
            # For 'paste', the 3rd arg is the mask. 
            # rotated_txt has alpha channel acting as mask.
            txt_layer.paste(rotated_txt, (x + row_offset, y), rotated_txt)

    out = Image.alpha_composite(img, txt_layer)
    return out.convert("RGB")

@app.cls(
    image=gpu_image,
    gpu="A10G", # A10G is efficient for this workload
    timeout=1800, # 30 min max
    scaledown_window=300, # Keep alive for 5 mins to handle bursty traffic
    max_containers=5 # Prevent OOM by limiting concurrent jobs per container
)
class PoisonEngine:
    def _ensure_loaded(self):
        # Check if attribute exists (initialized in __enter__) or if we need cold load
        if getattr(self, "device", None) and getattr(self, "model", None):
            return

        print("[PoisonEngine] Performing load of CLIP model...")
        from transformers import CLIPVisionModelWithProjection
        import torch
        
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        if self.device == "cpu":
            print("[PoisonEngine] WARNING: CUDA not available, falling back to CPU.")

        self.model = CLIPVisionModelWithProjection.from_pretrained(
            "openai/clip-vit-large-patch14"
        ).to(self.device, dtype=torch.float16 if self.device == "cuda" else torch.float32)
        self.model.eval()
        print(f"[PoisonEngine] Model loaded on {self.device}.")

    def __enter__(self):
        # Modal container entrypoint
        self.device = None
        self.model = None
        try:
            self._ensure_loaded()
        except Exception as e:
            print(f"[PoisonEngine] Init failed: {e}")
            import traceback
            traceback.print_exc()

    @modal.method()
    def apply_poison(self, img_bytes: bytes, config: Dict[str, Any], job_id: str = "unknown") -> bytes:
        import torch
        import torch.nn.functional as F
        from torchvision import transforms
        from PIL import Image
        import io
        import time

        log_prefix = f"[PoisonEngine] [Job: {job_id}]"
        print(f"{log_prefix} Processing job. Config: {config}")

        self._ensure_loaded()
        t0 = time.time()
        
        try:
            # 1. Load Image
            img_pil = Image.open(io.BytesIO(img_bytes)).convert("RGB")
            orig_w, orig_h = img_pil.size
            print(f"{log_prefix} Image loaded. Size: {orig_w}x{orig_h}")
            
            # 2. Prepare Tensors
            # Base tensor: [C, H, W]
            base_tensor = transforms.ToTensor()(img_pil).to(self.device)
            if self.device == "cuda":
                base_tensor = base_tensor.half() # float16
            
            # 3. Optimization Setup
            # We optimize 'delta' at 512x512 for higher quality noise patterns.
            # But we downscale to 224x224 on-the-fly for CLIP compatibility.
            work_res = (512, 512)
            
            # Base working tensor (512x512)
            base_work = F.interpolate(base_tensor.unsqueeze(0), size=work_res, mode='bilinear', align_corners=False)
            
            # Delta (Noise) variable [1, 3, 512, 512]
            delta = torch.zeros_like(base_work, dtype=torch.float32, requires_grad=True, device=self.device)
            
            # "Target": Random vector for semantic collapse
            target_vec = torch.randn(1, 768, device=self.device, dtype=base_tensor.dtype)
            target_vec = target_vec / target_vec.norm(dim=-1, keepdim=True)

            optimizer = torch.optim.Adam([delta], lr=0.005)
            scaler = torch.cuda.amp.GradScaler(enabled=(self.device == "cuda"))
            
            epsilon = config.get("epsilon", 0.04)
            steps = config.get("steps", 50)
            
            # 5. Optimization Loop
            print(f"{log_prefix} Starting optimization loop ({steps} steps) at {work_res}...")
            loop_t0 = time.time()

            for i in range(steps):
                optimizer.zero_grad()
                
                # Apply noise at 512 work resolution
                poisoned_work = base_work + delta.to(base_work.dtype)
                
                # Dynamic Resize to 224 for CLIP (Differentiable)
                clip_input = F.interpolate(poisoned_work, size=(224, 224), mode='bilinear', align_corners=False)
                
                with torch.cuda.amp.autocast(enabled=(self.device == "cuda")):
                    # Forward
                    vision_out = self.model(clip_input)
                    features = vision_out.image_embeds
                    
                    # Normalize features (NOT in-place to fix RuntimeError)
                    features = features / features.norm(dim=-1, keepdim=True)
                    
                    # Loss: Maximize cosine similarity to RANDOM vector 
                    loss = 1 - torch.cosine_similarity(features, target_vec).mean()
                
                scaler.scale(loss).backward()
                scaler.step(optimizer)
                scaler.update()
                
                # Constraint: Clamp delta to epsilon
                with torch.no_grad():
                    delta.data.clamp_(-epsilon, epsilon)
                
                if i % 25 == 0:
                     print(f"{log_prefix} Step {i}/{steps} Loss: {loss.item():.4f}")

            print(f"{log_prefix} Optimization finished in {time.time() - loop_t0:.2f}s")

            # 6. Apply to Original
            # Upscale the trained noise (delta 512) to original resolution
            with torch.no_grad():
                # Bicubic for smooth upscale of the noise pattern
                delta_full = F.interpolate(delta.to(base_tensor.dtype), size=(orig_h, orig_w), mode='bicubic', align_corners=False)
                
                # Add to original image
                final_tensor = torch.clamp(base_tensor + delta_full.squeeze(0), 0, 1)

            # 7. Output
            res_img = transforms.ToPILImage()(final_tensor.float().cpu())
            out_buf = io.BytesIO()
            res_img.save(out_buf, format="PNG")
            
            print(f"{log_prefix} Done in {time.time() - t0:.2f}s. Result size: {len(out_buf.getvalue())} bytes")
            return out_buf.getvalue()

        except Exception as e:
            print(f"{log_prefix} CRITICAL ERROR: {str(e)}")
            import traceback
            traceback.print_exc()
            raise e

@app.cls(
    image=cpu_image,
    cpu=2.0, # High CPU for watermarking math
    memory=2048,
    timeout=1200,
    secrets=[
        modal.Secret.from_name("shield-secret"),
        modal.Secret.from_name("cloudflare-r2-secret")
    ]
)
class ModelService:
    @modal.method()
    def process_job(self, req: ProtectionRequest) -> ProtectionResult:
        import requests
        from PIL import Image, ImageOps
        
        t0_total = time.time()
        print(f"[ModelService] STARTED job {req.artwork_id}")
        print(f"[ModelService] Config: {req.config}")
        
        job_states[str(req.artwork_id)] = {
            "status": "processing", 
            "started_at": t0_total,
            "artwork_id": req.artwork_id,
            "method": "poisoning",
            "message": "Initializing..."
        }

        applied_methods = []
        error_msg = None
        protected_url = None
        protected_key = None
        file_meta = {}
        status_code = "failed"

        try:
            # 1. Download
            job_states[str(req.artwork_id)].update({"message": "Downloading image..."})
            
            # Auth header for protected assets
            headers = {}
            if "MODAL_AUTH_TOKEN" in os.environ:
                 headers["Authorization"] = f"Bearer {os.environ['MODAL_AUTH_TOKEN']}"
            
            print(f"[ModelService] Downloading from {req.image_url} with auth...")
            r = requests.get(req.image_url, headers=headers, timeout=45)
            
            if r.status_code != 200: 
                print(f"[ModelService] Download Error Body: {r.text[:500]}")
                raise Exception(f"Download failed: {r.status_code}")
            
            # Helper to keep image as PIL in memory
            current_img = Image.open(io.BytesIO(r.content))
            try:
                current_img = ImageOps.exif_transpose(current_img)
            except Exception as e:
                print(f"[ModelService] Warning: Failed to apply EXIF orientation: {e}")

            icc_profile = current_img.info.get("icc_profile")
            
            # Handle alpha/metadata
            original_mode = current_img.mode
            if original_mode == 'RGBA':
                alpha = current_img.getchannel('A')
                current_img = current_img.convert("RGB")
            else:
                alpha = None
                
            # Resize if needed (CPU)
            # max_res = req.config.get("max_res", 3840)
            # if max(current_img.size) > max_res:
            #      current_img.thumbnail((max_res, max_res), Image.Resampling.LANCZOS)

            # 2. Poison Ivy (GPU Remote Call)
            if req.config.get("apply_poison", True):
                print("[ModelService] Offloading Poison Ivy to GPU engine...")
                job_states[str(req.artwork_id)].update({"message": "Generating adversarial noise (GPU)..."})
                
                # Convert to bytes for transport
                buf = io.BytesIO()
                current_img.save(buf, format="PNG")
                img_bytes = buf.getvalue()
                print(f"[ModelService] Sending {len(img_bytes)} bytes to GPU worker. This triggers container spawn if cold.")
                print("[ModelService] NOTE: If this is a cold start, please wait 2-4 minutes for GPU provisioning.")
                
                # Remote Call
                # We use .remote() to call the GPU worker
                gpu_start = time.time()
                try:
                    result_bytes = PoisonEngine().apply_poison.remote(img_bytes, req.config, req.artwork_id)
                    print(f"[ModelService] Received response from GPU worker in {time.time() - gpu_start:.2f}s. Size: {len(result_bytes)} bytes")
                    
                    current_img = Image.open(io.BytesIO(result_bytes))
                    applied_methods.append("poison_ivy")
                except Exception as gpu_err:
                     print(f"[ModelService] GPU Worker Failed: {gpu_err}")
                     raise gpu_err
            else:
                print("[ModelService] Skipped Poison Ivy.")

            # 3. AI Watermark (CPU Local)
            if req.config.get("apply_watermark", True):
                print("[ModelService] Applying AI Watermark (CPU)...")
                job_states[str(req.artwork_id)].update({"message": "Injecting hidden watermark..."})
                
                key = req.config.get("secret_key") or str(uuid.uuid4())
                alpha_val = req.config.get("alpha", 0.012)
                
                current_img = apply_ssw_watermark(current_img, key, alpha_val)
                applied_methods.append("ai_watermark")

            # 4. Visual Watermark (CPU Local)
            if req.config.get("apply_visual_watermark", False):
                print("[ModelService] Applying Visual Watermark (CPU)...")
                text = req.config.get("watermark_text", "DRIMIT PROTECTED")
                current_img = apply_visual_watermark(current_img, text)
                applied_methods.append("visual_watermark")

            # Restore Alpha
            if alpha:
                # Resize alpha if image was resized
                if alpha.size != current_img.size:
                    alpha = alpha.resize(current_img.size, Image.Resampling.LANCZOS)
                current_img.putalpha(alpha)

            # 5. Upload
            out_buf = io.BytesIO()
            current_img.save(out_buf, format="PNG", icc_profile=icc_profile, optimize=True)
            out_bytes = out_buf.getvalue()
            
            bucket = R2_BUCKET_DEV if req.is_preview else R2_BUCKET_PROD
            file_ext = "png"
            
            # --- Path Strategy: {USER_ID}/{HASH}/protected.png ---
            # Try to infer original structure from input URL to match it
            url_path = req.image_url.split('?')[0]
            parts = url_path.split('/')
            
            upload_user_id = req.user_id
            upload_hash = None
            
            # Heuristic: Find SHA256 standard hash in path (64 chars hex)
            for i, p in enumerate(parts):
                if len(p) == 64 and all(c in '0123456789abcdefABCDEF' for c in p):
                    upload_hash = p
                    # If the preceeding part looks like a user ID (or whatever folder structure), use it?
                    # But req.user_id is the source of truth for ownership.
                    # We should stick to req.user_id unless we want strict mirror of URL.
                    # User request: "{userID}/{hash}/{variant}.{ext}" with "exactamente como la original".
                    # Let's assume req.user_id is the correct folder (LtwsGQkv...)
                    break
            
            if not upload_hash:
                # Fallback: Hash of ORIGINAL content
                # We use the hash of the downloaded bytes (the 'original')
                # This guarantees the folder structure is content-addressable based on source
                print("[ModelService] Could not infer hash from URL. Calculating SHA256 of original.")
                upload_hash = hashlib.sha256(r.content).hexdigest()
            
            protected_key = f"{upload_user_id}/{upload_hash}/protected.{file_ext}"
            print(f"[ModelService] Uploading to key: {protected_key}")
            
            s3 = get_r2_client()
            s3.put_object(
                Bucket=bucket, 
                Key=protected_key, 
                Body=out_bytes, 
                ContentType="image/png"
            )
            
            protected_url = f"{os.environ['R2_PUBLIC_URL']}/{protected_key}"
            status_code = "completed"
            
            file_meta = {
                "size": len(out_bytes),
                "width": current_img.width,
                "height": current_img.height
            }

        except Exception as e:
            print(f"[ModelService] Error: {e}")
            import traceback
            traceback.print_exc()
            error_msg = str(e)
            status_code = "failed"

        # Final Result
        result = ProtectionResult(
            artwork_id=req.artwork_id,
            status=status_code,
            original_image_url=req.image_url,
            protected_image_url=protected_url,
            protected_image_key=protected_key,
            processing_time=time.time() - t0_total,
            file_metadata=file_meta,
            error_message=error_msg,
            applied_protections=applied_methods
        )
        
        job_states[str(req.artwork_id)] = {
            "status": status_code,
            "updated_at": time.time(),
            "result": result.dict(),
            "error": error_msg
        }
        
        return result

@app.function(image=cpu_image, secrets=[modal.Secret.from_name("shield-secret")])
@modal.fastapi_endpoint(method="POST", label="drimit-shield-poisoning-submit-protection-job")
async def process(req: ProtectionRequest, auth: HTTPAuthorizationCredentials = Depends(auth_scheme)):
    # Simple Auth Check
    token = os.environ.get("MODAL_AUTH_TOKEN", "").strip()
    if not token:
        print("[Auth] WARNING: MODAL_AUTH_TOKEN not set in server environment.")
    
    request_token = auth.credentials.strip()
    
    if request_token != token:
        # Debug Log (Masked)
        masked_rx = f"{request_token[:4]}...{request_token[-4:]}" if len(request_token) > 8 else "***"
        masked_real = f"{token[:4]}...{token[-4:]}" if len(token) > 8 else "***"
        print(f"[Auth] FAILED. Received: {masked_rx}, Expected: {masked_real}")
        
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    print(f"[Modal] [API] Received request for {req.artwork_id}")
    
    # Spawn the Orchestrator (CPU)
    job = ModelService().process_job.spawn(req)
    return {"status": "queued", "job_id": job.object_id, "artwork_id": req.artwork_id}

@app.function(image=cpu_image, secrets=[modal.Secret.from_name("shield-secret")])
@modal.fastapi_endpoint(method="POST", label="drimit-shield-poisoning-check-status")
async def check_status(req: BulkStatusRequest, auth: HTTPAuthorizationCredentials = Depends(auth_scheme)):
    token = os.environ.get("MODAL_AUTH_TOKEN", "").strip()
    request_token = auth.credentials.strip()
    
    if request_token != token:
        masked_rx = f"{request_token[:4]}...{request_token[-4:]}" if len(request_token) > 8 else "***"
        masked_real = f"{token[:4]}...{token[-4:]}" if len(token) > 8 else "***"
        print(f"[Auth] FAILED (Check Status). Rec: {masked_rx}, Exp: {masked_real}")
        raise HTTPException(status_code=401, detail="Unauthorized")
        
    results = {}
    for aid in req.artwork_ids:
        if aid in job_states:
             results[aid] = job_states[aid]
    
    # Ack cleanup
    if req.ack_ids:
        for aid in req.ack_ids:
            if aid in job_states:
                # Optional: Move to archive or delete. For now, delete to save space/cost.
                del job_states[aid]
                
    return results
