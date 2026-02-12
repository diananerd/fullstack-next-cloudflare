import modal
from fastapi import Request, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import io
import os
import time
import hashlib
import uuid
import warnings
from typing import Dict, Any, Optional, List
from pydantic import BaseModel, Field

# Suppress Diffusers FutureWarnings (VQModel deprecated path)
warnings.filterwarnings("ignore", category=FutureWarning, module="diffusers")
# Suppress LPIPS/Torchvision legacy warnings
warnings.filterwarnings("ignore", message="The parameter 'pretrained' is deprecated")
warnings.filterwarnings("ignore", message="Arguments other than a weight enum or `None` for 'weights' are deprecated")
# Suppress Torch load generic warning (triggerd by safe globals in older libs like lpips)
warnings.filterwarnings("ignore", message=".*weights_only=False.*")

# --- Types ---

class ProtectionRequest(BaseModel):
    image_url: str
    artwork_id: str
    user_id: str
    method: str = "poisoning" 
    config: Dict[str, Any] = {
        "apply_poison": True, # Pixel Disturbing (Visual Noise) - "Glaze-like"
        "apply_concept_poison": False, # Concept Manipulation (Text-Guided) - "Nightshade-like"
        "apply_watermark": True, # AI Watermark
        "apply_visual_watermark": False, # Visual Badge
        "watermark_text": "DRIMIT SHIELD", 
        "secret_key": None, 
        "epsilon": 0.04,
        "steps": 100,
        "alpha": 0.012,
        "max_res": 3840,
        "intensity": "Medium",  # Low, Medium, High
        "target_models": ["SDXL", "FLUX"] # "SD1.5", "SDXL", "FLUX", "ALL"
    }
    is_preview: bool = False
    verify_protection: bool = False # Enable VLM Audit

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
    verification_report: Optional[Dict[str, Any]] = None

class BulkStatusRequest(BaseModel):
    artwork_ids: list[str]
    ack_ids: Optional[list[str]] = None

# --- Config ---

R2_BUCKET_PROD = "drimit-shield-bucket"
R2_BUCKET_DEV = "drimit-shield-dev-bucket"

VERSION = "debug-fix-v5-namerror-check"
print(f"Loading Poison Engine. Version: {VERSION}")

app = modal.App("drimit-shield-poisoning")
job_states = modal.Dict.from_name("shield-job-states", create_if_missing=True)

# --- Images & Helpers ---

def download_models():
    """Cache models in the image build step."""
    import os
    os.environ["HF_HUB_ENABLE_HF_TRANSFER"] = "1"
    
    print("[Build] Downloading CLIP Model for build cache...")
    from transformers import CLIPModel, AutoModelForCausalLM, AutoTokenizer, SiglipModel
    CLIPModel.from_pretrained("openai/clip-vit-large-patch14")
    AutoTokenizer.from_pretrained("openai/clip-vit-large-patch14", clean_up_tokenization_spaces=True)

    print("[Build] Downloading SigLIP (Google) for build cache...")
    # We need the full model for better gradients, or at least the vision tower via transformers
    SiglipModel.from_pretrained("google/siglip-so400m-patch14-384")
    AutoTokenizer.from_pretrained("google/siglip-so400m-patch14-384", clean_up_tokenization_spaces=True)

    print("[Build] Downloading Moondream (Verifier) for build cache...")
    model_id = "vikhyatk/moondream2"
    rev = "2024-08-26"
    
    # Using trust_remote_code=True causes warnings about GenerationMixin in newer transformers. 
    # This is a warning from the library itself for custom code models, hard to suppress cleanly without ignores.
    # However, we can try to suppress it.
    import warnings
    warnings.filterwarnings("ignore", message=".*GenerationMixin.*")
    warnings.filterwarnings("ignore", message=".*PhiForCausalLM has generative capabilities.*")
    
    # Try loading with trust_remote_code=True for custom Phi code
    AutoModelForCausalLM.from_pretrained(model_id, trust_remote_code=True, revision=rev)
    AutoTokenizer.from_pretrained(model_id, revision=rev, clean_up_tokenization_spaces=True)
    
    print("[Build] Downloading LPIPS metric...")
    import lpips
    lpips.LPIPS(net='alex')

    print("[Build] Downloading Flux.1-schnell (Attack Sim)...")
    try:
        from huggingface_hub import snapshot_download
        import os
        
        # Now that we have the proper secret, checking Official Repo
        flux_model_id = "black-forest-labs/FLUX.1-schnell" 
        
        token = os.environ.get("HF_TOKEN") or os.environ.get("HUGGINGFACE_TOKEN")
        if token:
            print(f"[Build] Found HF_TOKEN, attempting authenticated download of {flux_model_id}...")
            # Use snapshot_download to avoid loading the model into RAM (which causes OOM or CUDA warnings on build nodes)
            # This ensures all weights are cached for runtime usage.
            snapshot_download(
                repo_id=flux_model_id, 
                token=token,
                ignore_patterns=["*.bin", "*.msgpack", "*.h5", "*training*", "*optimizer*"] 
            )
        else:
             print("[Build] WARNING: No HF_TOKEN found during build phase. Flux download skipped (will happen at runtime).")
        
        print("[Build] Downloading SDXL-Turbo (Secondary Attack Sim)...")
        # Same for SDXL
        snapshot_download(
            repo_id="stabilityai/sdxl-turbo",
            ignore_patterns=["*.bin", "*.msgpack", "*.h5", "*training*", "*optimizer*"]
        )

    except Exception as e:
        # If this fails during build (e.g. 403 Forbidden because terms not accepted locally),
        # we still want the build to succeed so the user can fix it at runtime or update terms.
        # But we print a VERY loud warning.
        print(f"[Build] CRITICAL WARNING: Failed to download Flux. Error: {e}")
        print("[Build] The app will deploy, but runtime verification might fail or be slow.")

cpu_image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install("liblcms2-2", "fonts-dejavu-core")
    .pip_install("Pillow", "requests", "boto3", "numpy<2", "opencv-python-headless", "fastapi[standard]")
)

gpu_image = (
    modal.Image.from_registry("pytorch/pytorch:2.4.0-cuda12.1-cudnn9-runtime")
    .env({
        "DEBIAN_FRONTEND": "noninteractive", 
        "HF_HUB_ENABLE_HF_TRANSFER": "1",
        "PYTORCH_CUDA_ALLOC_CONF": "expandable_segments:True"
    })
    .apt_install("libgl1", "libglib2.0-0", "liblcms2-2", "git")
    .pip_install(
        "transformers>=4.48.0,<4.50.0", 
        "accelerate", 
        "diffusers>=0.32.1",  # Explicit patch version bump
        "protobuf", "sentencepiece",
        "Pillow", "numpy<2",
        "fastapi", "pydantic", "boto3", "requests",
        "timm", "lpips", "open_clip_torch", "einops", "hf_transfer"
    )
    .run_function(download_models, secrets=[modal.Secret.from_name("shield-secret")])
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
    import cv2
    import numpy as np
    from PIL import Image
    if not key: return img_pil
    img_np = np.array(img_pil)
    img_f = img_np.astype(np.float32) / 255.0
    yuv = cv2.cvtColor(img_f, cv2.COLOR_RGB2YUV)
    y, u, v = cv2.split(yuv)
    dct_y = cv2.dct(y)
    h, w = y.shape
    seed = int(hashlib.sha256(key.encode()).hexdigest(), 16) % (2**32)
    gen = np.random.RandomState(seed)
    mask = gen.uniform(-1, 1, dct_y.shape).astype(np.float32)
    freq_mask = np.zeros_like(dct_y)
    freq_mask[h//8:h//2, w//8:w//2] = 1 
    dct_y_marked = dct_y + (alpha * mask * freq_mask * np.mean(np.abs(dct_y)))
    y_res = cv2.idct(dct_y_marked)
    res_yuv = cv2.merge([y_res, u, v])
    res_rgb = cv2.cvtColor(res_yuv, cv2.COLOR_YUV2RGB)
    res_uint8 = np.clip(res_rgb * 255.0, 0, 255).astype(np.uint8)
    return Image.fromarray(res_uint8)

def detect_ssw_watermark(img_pil, key):
    import cv2
    import numpy as np
    if not key: return 0.0
    try:
        img_np = np.array(img_pil.convert("RGB"))
        img_f = img_np.astype(np.float32) / 255.0
        # Resize to standard if needed? For now assume robustness to standard resizing or original size
        # Ideally detection should search scales, but let's stick to single scale for MVP
        yuv = cv2.cvtColor(img_f, cv2.COLOR_RGB2YUV)
        y, _, _ = cv2.split(yuv)
        dct_y = cv2.dct(y)
        h, w = y.shape
        
        # Regenerate Key Mask
        seed = int(hashlib.sha256(key.encode()).hexdigest(), 16) % (2**32)
        gen = np.random.RandomState(seed)
        mask = gen.uniform(-1, 1, dct_y.shape).astype(np.float32)
        freq_mask = np.zeros_like(dct_y)
        freq_mask[h//8:h//2, w//8:w//2] = 1 
        
        # Correlation
        # We look for correlation in the frequency band we marked
        roi_dct = dct_y * freq_mask
        roi_mask = mask * freq_mask
        
        # Normalized Correlation
        # score = dot(roi_dct, roi_mask)
        score = np.sum(roi_dct * roi_mask)
        
        # Normalize by energy of mask and mean signal to get a comparable metric
        # This is a raw score, higher is better. Typically > 0.5 or 1.0 depending on scaling.
        # Let's normalize to a roughly 0-1 scale based on expected strength
        energy = np.sum(np.abs(roi_mask))
        if energy == 0: return 0.0
        
        normalized_score = (score / energy) * 100 # Scaling for readability
        return float(normalized_score)
    except Exception:
        return 0.0

def apply_visual_watermark(img_pil, text, opacity=160):
    from PIL import Image, ImageDraw, ImageFont
    img = img_pil.convert("RGBA")
    width, height = img.size
    txt_layer = Image.new("RGBA", img.size, (255, 255, 255, 0))
    font_size = int(width * 0.05) if int(width * 0.05) > 20 else 20
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", font_size)
    except:
        font = ImageFont.load_default()
    dummy_draw = ImageDraw.Draw(txt_layer)
    bbox = dummy_draw.textbbox((0, 0), text, font=font)
    text_width, text_height = bbox[2] - bbox[0], bbox[3] - bbox[1]
    angle, pad = 45, 50
    tile_w, tile_h = text_width + pad * 2, text_height + pad * 2
    txt_img = Image.new('RGBA', (tile_w, tile_h), (255, 255, 255, 0))
    d = ImageDraw.Draw(txt_img)
    tx, ty = pad, pad
    d.text((tx+2, ty+2), text, font=font, fill=(0, 0, 0, int(opacity * 0.8)))
    d.text((tx, ty), text, font=font, fill=(255, 255, 255, int(opacity)))
    rotated_txt = txt_img.rotate(angle, expand=True, resample=Image.Resampling.BICUBIC)
    tw, th = rotated_txt.size
    gap_x, gap_y = int(tw * 1.5), int(th * 1.5)
    for y in range(-th, height + th, gap_y):
        row_idx = y // gap_y
        row_offset = (gap_x // 2) if (row_idx % 2 == 1) else 0
        for x in range(-tw - row_offset, width + tw, gap_x):
            txt_layer.paste(rotated_txt, (x + row_offset, y), rotated_txt)
    return Image.alpha_composite(img, txt_layer).convert("RGB")

class JobLogger:
    def __init__(self, job_id: str, component: str):
        self.job_id = job_id
        self.component = component
        self.prefix = f"[{self.component}] [{self.job_id}]"
    def info(self, msg: str): print(f"{self.prefix} ℹ️ {msg}")
    def warn(self, msg: str): print(f"{self.prefix} ⚠️ {msg}")
    def error(self, msg: str): print(f"{self.prefix} ❌ {msg}")
    def success(self, msg: str): print(f"{self.prefix} ✅ {msg}")

# --- Engines ---

@app.cls(
    image=gpu_image,
    gpu="A10G",
    timeout=1800,
    scaledown_window=300
)
class PoisonEngine:
    @modal.enter()
    def load_models(self):
        print("[PoisonEngine] Warming up...")
        self._ensure_loaded()

    def _ensure_loaded(self):
        if getattr(self, "model_clip", None): return
        import torch
        from transformers import CLIPModel, SiglipModel, AutoTokenizer
        import lpips
        
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        if self.device == "cpu": print("[PoisonEngine] WARNING: CUDA not available")

        # 1. CLIP with Text (Legacy / Stable Diffusion 1.5/XL / Flux Text Encoder 1)
        print("[PoisonEngine] Loading CLIP (SDXL/Flux Target)...")
        self.model_clip = CLIPModel.from_pretrained(
            "openai/clip-vit-large-patch14"
        ).to(self.device, dtype=torch.float16 if self.device == "cuda" else torch.float32)
        self.tokenizer_clip = AutoTokenizer.from_pretrained("openai/clip-vit-large-patch14", clean_up_tokenization_spaces=True)
        self.model_clip.eval()
        self.model_clip.requires_grad_(False) # Freeze

        # 2. SigLIP with Text (Modern / Gemini / Verify)
        # Replacing SigLIP with OpenCLIP ViT-G/14 (SDXL Primary) could be better for SDXL, 
        # but SigLIP is a good generalist. 
        # Let's add SDXL's OpenCLIP (laion/CLIP-ViT-bigG-14-laion2B-39B-b160k) if possible, 
        # but it's huge. Sticking to SigLIP as proxy for "Modern VLM" is okay, 
        # but effectively attacking Flux's T5 is hard without loading T5. 
        # We will count on CLIP attack transferring to Flux since Flux uses CLIP too.
        print("[PoisonEngine] Loading SigLIP (VLM Target)...")
        self.model_siglip = SiglipModel.from_pretrained(
            "google/siglip-so400m-patch14-384"
        ).to(self.device, dtype=torch.float16 if self.device == "cuda" else torch.float32)
        self.tokenizer_siglip = AutoTokenizer.from_pretrained("google/siglip-so400m-patch14-384", clean_up_tokenization_spaces=True)
        self.model_siglip.eval()
        self.model_siglip.requires_grad_(False) # Freeze

        # 3. LPIPS (Perceptual Constraint)
        print("[PoisonEngine] Loading LPIPS...")
        self.loss_lpips = lpips.LPIPS(net='alex').to(self.device)
        self.loss_lpips.eval()
        self.loss_lpips.requires_grad_(False)

        print(f"[PoisonEngine] All models loaded on {self.device}.")

    @modal.method()
    def apply_poison(self, img_bytes: bytes, config: Dict[str, Any], job_id: str = "unknown") -> Dict[str, Any]:
        import torch
        import torch.nn.functional as F
        from torchvision import transforms
        from PIL import Image
        import time

        logger = JobLogger(job_id, "PoisonEngine")
        logger.info(f"Processing job. Config: {config}")

        self._ensure_loaded()
        t0 = time.time()
        
        try:
            img_pil = Image.open(io.BytesIO(img_bytes)).convert("RGB")
            orig_w, orig_h = img_pil.size
            
            # Base tensor: [0, 1] usually, but for LPIPS typically [-1, 1]
            # We will work in [0, 1] and normalize for each model
            base_tensor = transforms.ToTensor()(img_pil).to(self.device)
            if self.device == "cuda": base_tensor = base_tensor.half()
            
            # Resolution config
            work_res = (512, 512)
            
            # Upscale/Resize for optimization
            base_work = F.interpolate(base_tensor.unsqueeze(0), size=work_res, mode='bilinear', align_corners=False)
            
            # We optimize delta in [0, 1] range relative to image
            delta = torch.zeros_like(base_work, dtype=torch.float32, requires_grad=True, device=self.device)
            
            # --- Target Generation (Concept Switching Strategy) ---
            # Strategy: Text-Guided Concept Erasure (Nightshade-equivalent) & Visual Noise (Glaze-equivalent)
            # 
            # 1. Glaze-equivalent (apply_poison=True):
            #    We push the image features AWAY from the original image (Repel).
            #    Target: CLIP ViT-L/14 (SD1.5, SDXL, Flux) + SigLIP (Modern VLM proxy).
            #
            # 2. Nightshade-equivalent (apply_concept_poison=True):
            #    We pull the image features TOWARDS a specific target text (Attract).
            #    This "poisons" the training data by associating the image content with "Noise" or "Error".
            #    Target: "static noise", "glitch", "error".
            
            target_prompts = [
                "static noise pattern",
                "abstract grey digital texture",
                "blank screen error"
            ]
            
            with torch.no_grad():
                # CLIP Original
                clip_base_input = F.interpolate(base_work, size=(224, 224), mode='bilinear', align_corners=False)
                clip_norm = transforms.Normalize((0.48145466, 0.4578275, 0.40821073), (0.26862954, 0.26130258, 0.27577711))
                clip_base_norm = clip_norm(clip_base_input.squeeze(0)).unsqueeze(0)
                orig_features_clip = self.model_clip.get_image_features(pixel_values=clip_base_norm)
                orig_features_clip = orig_features_clip / orig_features_clip.norm(dim=-1, keepdim=True)

                # SigLIP Original
                siglip_base_input = F.interpolate(base_work, size=(384, 384), mode='bilinear', align_corners=False)
                siglip_base_norm = (siglip_base_input - 0.5) / 0.5
                orig_features_siglip = self.model_siglip.get_image_features(pixel_values=siglip_base_norm)
                orig_features_siglip = orig_features_siglip / orig_features_siglip.norm(dim=-1, keepdim=True)
                
                # Text Targets
                # CLIP Text
                text_inputs_clip = self.tokenizer_clip(target_prompts, padding=True, return_tensors="pt").to(self.device)
                text_features_clip = self.model_clip.get_text_features(**text_inputs_clip)
                target_clip = text_features_clip.mean(dim=0, keepdim=True)
                target_clip = target_clip / target_clip.norm(dim=-1, keepdim=True)
                
                # SigLIP Text
                text_inputs_siglip = self.tokenizer_siglip(target_prompts, padding="max_length", return_tensors="pt").to(self.device)
                text_features_siglip = self.model_siglip.get_text_features(**text_inputs_siglip)
                target_siglip = text_features_siglip.mean(dim=0, keepdim=True)
                target_siglip = target_siglip / target_siglip.norm(dim=-1, keepdim=True)

            # Intensity Settings
            intensity = config.get("intensity", "Medium")
            
            if intensity == "High":
                # Nuclear Mode + Text Guidance
                epsilon = 80/255
                alpha_step = 4/255
                steps = 600
                w_lpips = 0.0
                w_repel = 15.0 
                w_attract = 10.0 # Increased attraction to Text Target
            elif intensity == "Low":
                epsilon = 6/255 
                alpha_step = 1/255
                steps = 50
                w_lpips = 5.0
                w_repel = 1.0
                w_attract = 1.0
            else: # Medium
                epsilon = 32/255
                alpha_step = 2/255
                steps = 200
                w_lpips = 0.01
                w_repel = 2.0
                w_attract = 2.0
            
            # Override from config if specific
            if "epsilon" in config: epsilon = config["epsilon"]
            if "steps" in config: steps = config["steps"]
            
            logger.info(f"Starting Text-Guided PGD | Steps: {steps} | Epsilon: {epsilon:.3f}")
            loop_t0 = time.time()

            try:
                # PGD Loop
                for i in range(steps):
                    delta.requires_grad_(True)
                    if delta.grad is not None: delta.grad.zero_()
                    
                    # Perturbed Image
                    adv_img = base_work + delta.to(base_work.dtype)
                    adv_img = torch.clamp(adv_img, 0, 1)

                    # 1. CLIP Loss
                    clip_input = F.interpolate(adv_img, size=(224, 224), mode='bilinear', align_corners=False)
                    clip_input_norm = clip_norm(clip_input.squeeze(0)).unsqueeze(0)
                    
                    features_clip = self.model_clip.get_image_features(pixel_values=clip_input_norm)
                    features_clip = features_clip / features_clip.norm(dim=-1, keepdim=True)
                    
                    # Attract to "Static Noise" Text
                    loss_clip_attract = 1 - torch.cosine_similarity(features_clip, target_clip).mean()
                    # Repel from Original Image
                    loss_clip_repel = torch.cosine_similarity(features_clip, orig_features_clip).mean()

                    # 2. SigLIP Loss (Primary Target for Moondream)
                    siglip_input = F.interpolate(adv_img, size=(384, 384), mode='bilinear', align_corners=False)
                    siglip_input_norm = (siglip_input - 0.5) / 0.5
                    
                    features_siglip = self.model_siglip.get_image_features(pixel_values=siglip_input_norm)
                    features_siglip = features_siglip / features_siglip.norm(dim=-1, keepdim=True)
                    
                    loss_siglip_attract = 1 - torch.cosine_similarity(features_siglip, target_siglip).mean()
                    loss_siglip_repel = torch.cosine_similarity(features_siglip, orig_features_siglip).mean()

                    # 3. LPIPS Loss
                    loss_perc = self.loss_lpips(adv_img.float() * 2 - 1, base_work.float() * 2 - 1).mean()

                    # Total Loss Calculation
                    # Split strategies based on config
                    loss_pixel = 0.0
                    loss_concept = 0.0
                    
                    # Strategy A: Concept Manipulation (Text-Guided) - "Nuclear Mode"
                    if config.get("apply_concept_poison", False):
                        loss_concept = (loss_clip_attract * w_attract) + (loss_siglip_attract * w_attract)
                    
                    # Strategy B: Pixel Disturbing (Visual Noise) - "Classic Mode"
                    if config.get("apply_poison", True):
                         # If both are active, we might reduce the weight of repulsion to avoid conflict?
                         # For now, simplistic sum. Repel moves away from original embedding.
                         loss_pixel = (loss_clip_repel * w_repel) + (loss_siglip_repel * w_repel)

                    
                    # Heavily weight SigLIP as it's the specific target for our VLM (Moondream)
                    # Fixed: Ensure definition exists before backward call
                    total_loss = (1.0 * loss_pixel) + (10.0 * loss_concept) + (w_lpips * loss_perc)
                    
                    if 'total_loss' in locals():
                        if i % 10 == 0: logger.info(f"Step {i}: Total Loss defined as {total_loss.item()}")
                        total_loss.backward()
                    else:
                        logger.error(f"Step {i}: Total Loss NOT DEFINED. Skipping backward.")
                        continue
                    
                    # PGD Step
                    with torch.no_grad():
                        grad = delta.grad.sign()
                        delta.data = delta.data - alpha_step * grad # Minimize loss -> we want to minimize total_loss
                        
                        # Projection (Epsilon Ball)
                        delta.data = torch.clamp(delta.data, -epsilon, epsilon)
                        
                        # Valid Image Range
                        # (base + delta) must be in [0,1] => delta in [-base, 1-base]
                        delta.data = torch.max(torch.min(delta.data, 1 - base_work), -base_work)

                    if i % 10 == 0:
                        # Define display values for logging since loss_clip and loss_siglip are no longer direct aggregations
                        display_loss_clip = loss_clip_attract.item() if config.get("apply_concept_poison", False) else loss_clip_repel.item()
                        display_loss_sig = loss_siglip_attract.item() if config.get("apply_concept_poison", False) else loss_siglip_repel.item()
                        logger.info(f"Step {i}/{steps} | Loss: {total_loss.item():.3f} | CLIP_Sim: {display_loss_clip:.3f} | SIG_Sim: {display_loss_sig:.3f} | L_PERC: {loss_perc.item():.3f}")

            except Exception as loop_e:
                logger.error(f"Error inside PGD Loop: {loop_e}")
                pass

            logger.info(f"Optimization finished in {time.time() - loop_t0:.2f}s")

            with torch.no_grad():
                delta_full = F.interpolate(delta.to(base_tensor.dtype), size=(orig_h, orig_w), mode='bicubic', align_corners=False)
                final_tensor = torch.clamp(base_tensor + delta_full.squeeze(0), 0, 1)

            res_img = transforms.ToPILImage()(final_tensor.float().cpu())
            out_buf = io.BytesIO()
            res_img.save(out_buf, format="PNG")
            
            logger.success(f"Done in {time.time() - t0:.2f}s")
            return {
                "data": out_buf.getvalue(),
                "metrics": {
                    "final_loss": total_loss.item() if ('total_loss' in locals() and isinstance(total_loss, torch.Tensor)) else 0.0,
                    "steps": i,
                    "epsilon": epsilon,
                    "time": time.time() - t0
                }
            }

        except Exception as e:
            logger.error(f"CRITICAL ERROR: {str(e)}")
            import traceback
            traceback.print_exc()
            raise e

@app.cls(
    image=gpu_image,
    gpu="A10G",
    timeout=600,
    scaledown_window=120,
    secrets=[modal.Secret.from_name("shield-secret")]
)
class VerifierEngine:
    @modal.enter()
    def load_models(self):
        print("[VerifierEngine] Process started. libraries loaded.")
        # PATCH (Flux/Diffusers <-> PyTorch 2.4 Bug): 
        # Diffusers >=0.31 sends 'enable_gqa' to SDPA, which is only supported in PyTorch 2.5+.
        # We intercept it here globally.
        import torch.nn.functional as F
        if hasattr(F, "scaled_dot_product_attention"):
             original_sdpa = F.scaled_dot_product_attention
             def safe_sdpa(query, key, value, attn_mask=None, dropout_p=0.0, is_causal=False, scale=None, enable_gqa=None):
                 # Drop enable_gqa if present
                 return original_sdpa(query, key, value, attn_mask=attn_mask, dropout_p=dropout_p, is_causal=is_causal, scale=scale)
             F.scaled_dot_product_attention = safe_sdpa
             print("[VerifierEngine] Patched torch.nn.functional.scaled_dot_product_attention for GQA compatibility.")

    def _load_moondream(self):
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        
        print(f"[VerifierEngine] Loading Moondream2 on {self.device}...")
        model_id = "vikhyatk/moondream2"
        rev = "2024-08-26"
        self.moondream_model = AutoModelForCausalLM.from_pretrained(
            model_id, trust_remote_code=True, revision=rev,
            torch_dtype=torch.float16 if self.device == "cuda" else torch.float32
        ).to(self.device)
        self.moondream_tokenizer = AutoTokenizer.from_pretrained(model_id, revision=rev, clean_up_tokenization_spaces=True)
        self.moondream_model.eval()

    def _unload_moondream(self):
        import gc
        import torch
        if hasattr(self, 'moondream_model'):
            del self.moondream_model
        if hasattr(self, 'moondream_tokenizer'):
            del self.moondream_tokenizer
        gc.collect()
        torch.cuda.empty_cache()
        print("[VerifierEngine] Moondream unloaded.")

    def _load_flux(self):
        import torch
        from diffusers import FluxImg2ImgPipeline, FluxPipeline
        import os
        import gc
        import torch.nn.functional as F
        
        # PATCH: Fix for 'unexpected keyword argument enable_gqa' crash with Flux on PyTorch < 2.5
        # Diffusers' FluxAttnProcessor2_0 sends 'enable_gqa' to SDPA, which strictly requires PyTorch 2.5+.
        if hasattr(F, "scaled_dot_product_attention") and not getattr(F.scaled_dot_product_attention, "__patched_for_gqa__", False):
            _orig_sdpa = F.scaled_dot_product_attention
            def _sdpa_safe(*args, **kwargs):
                kwargs.pop("enable_gqa", None)
                return _orig_sdpa(*args, **kwargs)
            _sdpa_safe.__patched_for_gqa__ = True
            F.scaled_dot_product_attention = _sdpa_safe

        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"[VerifierEngine] Loading Flux.1-schnell on {self.device}...")
        
        flux_model_id = "black-forest-labs/FLUX.1-schnell"
        token = os.environ.get("HF_TOKEN") or os.environ.get("HUGGINGFACE_TOKEN")
        
        try:
            # Flux is extremely large (~24GB in bf16). We CANNOT load it all to GPU at once on A10G (24GB).
            # We must use model offloading.
            # Do NOT call .to(self.device) on the pipeline directly.
            self.flux_i2i = FluxImg2ImgPipeline.from_pretrained(
                flux_model_id, 
                dtype=torch.bfloat16,
                token=token,
            )
            
            # Offloading splits components (Text Encoder, Transformer, VAE) and moves them 
            # to GPU only when needed, keeping the rest on CPU.
            # UPDATE: enable_model_cpu_offload() is not enough for Flux on 24GB VRAM when fragmentation is high.
            # We switch to enable_sequential_cpu_offload() which offloads state dict to CPU layer-by-layer.
            # This is slower but guarantees it will fit.
            self.flux_i2i.enable_sequential_cpu_offload()
            
            # Optional: Enable VAE slicing/tiling to save VRAM during decoding
            self.flux_i2i.vae.enable_slicing()
            self.flux_i2i.vae.enable_tiling()
            
        except Exception as e:
            print(f"[VerifierEngine] Failed to load Flux: {e}")
            raise e
        
        self.flux_t2i = FluxPipeline.from_pipe(self.flux_i2i)

    def _unload_flux(self):
        import gc
        import torch
        if hasattr(self, 'flux_i2i'): del self.flux_i2i
        if hasattr(self, 'flux_t2i'): del self.flux_t2i
        gc.collect()
        torch.cuda.empty_cache()
        print("[VerifierEngine] Flux unloaded.")

    def _load_sdxl(self):
        import torch
        from diffusers import AutoPipelineForImage2Image
        import gc
        
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"[VerifierEngine] Loading SDXL-Turbo on {self.device}...")
        try:
            self.sdxl_i2i = AutoPipelineForImage2Image.from_pretrained(
                "stabilityai/sdxl-turbo",
                dtype=torch.float16,
                variant="fp16"
            )
            # Use offloading for SDXL as well to be safe, especially if fragmentation is high
            self.sdxl_i2i.enable_model_cpu_offload()
        except Exception as e:
            print(f"[VerifierEngine] Warning: SDXL-Turbo failed to load: {e}")
            self.sdxl_i2i = None

    def _unload_sdxl(self):
        import gc
        import torch
        if hasattr(self, 'sdxl_i2i'): del self.sdxl_i2i
        gc.collect()
        torch.cuda.empty_cache()
        print("[VerifierEngine] SDXL unloaded.")

    @modal.method()
    def verify_protection(self, img_bytes: bytes, job_id: str, config: Dict[str, Any] = {}) -> Dict[str, Any]:
        import torch
        from PIL import Image
        import time
        import base64
        import gc

        logger = JobLogger(job_id, "VerifierEngine")
        logger.info("Starting audit...")
        t0 = time.time()
        
        try:
            image = Image.open(io.BytesIO(img_bytes)).convert("RGB")
            report = {
                "semantic_audit": None,
                "pixel_audit": None,
                "watermark_audit": None,
                "model_used": "vikhyatk/moondream2 + FLUX.1-schnell",
            }
            
            # --- 0. Watermark Detection (CPU) ---
            watermark_key = config.get("secret_key")
            if watermark_key:
                logger.info("Verifying invisible watermark...")
                score = detect_ssw_watermark(image, watermark_key)
                detected = score > 2.0
                logger.info(f"Watermark Score: {score:.4f} | Detected: {detected}")
                report["watermark_audit"] = {
                    "detected": detected,
                    "score": score
                }
            
            # --- 1. Semantic Audit (Moondream Inference) ---
            self._load_moondream()
            logger.info("Running Semantic Audit...")
            
            with torch.no_grad():
                enc_image = self.moondream_model.encode_image(image)
                description = self.moondream_model.answer_question(enc_image, "Describe this image in detail.", self.moondream_tokenizer)
                tags = self.moondream_model.answer_question(enc_image, "List 5 key visual elements, comma separated.", self.moondream_tokenizer)
                quality_check = self.moondream_model.answer_question(enc_image, "Does this image look like a clean high quality photograph? Answer yes or no.", self.moondream_tokenizer)

                report["semantic_audit"] = {
                    "generated_caption": description,
                    "detected_tags": tags,
                }
            
            short_description = description[:250]
            
            # Unload Moondream immediately
            self._unload_moondream()

            # --- 2. Attack Simulation (Flux) ---
            logger.info(f"Simulating attacks with prompt: '{short_description}...'")
            
            self._load_flux()
            
            w, h = image.size
            max_dim = 1024
            if w > max_dim or h > max_dim:
                ratio = min(max_dim / w, max_dim / h)
                new_size = (int(w * ratio), int(h * ratio))
                input_image_resized = image.resize(new_size, Image.Resampling.LANCZOS)
            else:
                input_image_resized = image

            # Ensure divisible by 8/16/32? Flux usually fine with standard sizes.
            # Rounding to 32 just in case
            w_r, h_r = input_image_resized.size
            w_r, h_r = (w_r // 32) * 32, (h_r // 32) * 32
            input_image_resized = input_image_resized.resize((w_r, h_r))

            # 1. Flux.1-Schnell Attack (Img2Img + Text2Img)
            # We group Flux operations to minimize load/unload cycles
            logger.info("Attacking with Flux.1-Schnell...")
            flux_success = False
            mimic_pixel_bytes = None
            mimic_semantic_bytes = None
            
            try:
                # A) Img2Img
                with torch.no_grad():
                    mimicry_res = self.flux_i2i(
                        prompt=short_description, 
                        image=input_image_resized, 
                        strength=0.6, 
                        num_inference_steps=4, # Flux Schnell is 4 step
                        guidance_scale=0.0
                    ).images[0]
                
                mimic_buf = io.BytesIO()
                mimicry_res.save(mimic_buf, format="PNG")
                mimic_pixel_bytes = mimic_buf.getvalue()
                flux_success = True
                
                # B) Text2Img (Semantic Reconstruction)
                logger.info("Running Semantic Reconstruction (Text2Img)...")
                with torch.no_grad():
                    recon_res = self.flux_t2i(
                        prompt=short_description, 
                        height=h_r, width=w_r,
                        num_inference_steps=4, 
                        guidance_scale=0.0,
                        max_sequence_length=256
                    ).images[0]
                
                recon_buf = io.BytesIO()
                recon_res.save(recon_buf, format="PNG")
                mimic_semantic_bytes = recon_buf.getvalue()
                
            except Exception as e:
                logger.error(f"Flux Operations Failed: {e}")
                
            # Unload Flux to free VRAM for SDXL
            self._unload_flux()

            # 2. SDXL-Turbo Attack (Secondary Check)
            logger.info("Attacking with SDXL-Turbo...")
            sdxl_bytes = None
            
            self._load_sdxl()
            try:
                if getattr(self, "sdxl_i2i", None):
                    with torch.no_grad():
                        # SDXL Turbo needs usually 1-4 steps, strength 0.5-0.7
                        sdxl_res = self.sdxl_i2i(
                            prompt=short_description,
                            image=input_image_resized,
                            strength=0.6,
                            num_inference_steps=2,
                            guidance_scale=0.0
                        ).images[0]
                    sdxl_buf = io.BytesIO()
                    sdxl_res.save(sdxl_buf, format="PNG")
                    sdxl_bytes = sdxl_buf.getvalue()
            except Exception as e:
                logger.error(f"SDXL Attack Failed: {e}")
            
            self._unload_sdxl()

            
            report["pixel_audit"] = {
                "perceived_quality": quality_check,
                "attack_prompt": short_description,
                "attack_strength": 0.6,
                "attack_guidance": 0.0,
                "attack_model_primary": "Flux.1-Schnell (Img2Img)",
                "attack_model_secondary": "SDXL-Turbo (Img2Img)",
                "flux_success": flux_success,
                "sdxl_success": (sdxl_bytes is not None)
            }

            if report["semantic_audit"]:
                report["semantic_audit"]["reconstruction_model"] = "Flux.1-Schnell (Text2Img)"
            
            # Return images
            # Primary return is usually the stronger model (Flux)
            report["mimicry_pixel_bytes"] = mimic_pixel_bytes 
            report["mimicry_sdxl_bytes"] = sdxl_bytes
            report["mimicry_semantic_bytes"] = mimic_semantic_bytes
            
            # Legacy fallback
            report["mimicry_bytes"] = mimic_pixel_bytes
            
            logger.success(f"Audit complete in {time.time() - t0:.2f}s")
            return report
            
        except Exception as e:
            logger.error(f"Verification failed: {e}")
            import traceback
            traceback.print_exc()
            return {"error": str(e)}

# --- Orchestration ---

@app.cls(
    image=cpu_image,
    cpu=2.0,
    memory=2048,
    timeout=1200,
    secrets=[modal.Secret.from_name("shield-secret"), modal.Secret.from_name("cloudflare-r2-secret")]
)
class ModelService:
    @modal.method()
    def process_job(self, req: ProtectionRequest) -> ProtectionResult:
        import requests
        from PIL import Image, ImageOps
        
        t0_total = time.time()
        logger = JobLogger(req.artwork_id, "ModelService")
        logger.info(f"Processing. Config: {req.config}")
        
        job_states[str(req.artwork_id)] = {
            "status": "processing", "started_at": t0_total,
            "artwork_id": req.artwork_id, "method": "poisoning", "message": "Initializing..."
        }

        applied_methods, verifier_report = [], None
        protected_url, protected_key, file_meta = None, None, {}
        status_code = "failed"
        error_msg = None

        try:
            job_states[str(req.artwork_id)].update({"message": "Downloading..."})
            headers = {}
            if "MODAL_AUTH_TOKEN" in os.environ: headers["Authorization"] = f"Bearer {os.environ['MODAL_AUTH_TOKEN']}"
            r = requests.get(req.image_url, headers=headers, timeout=45)
            if r.status_code != 200: raise Exception(f"Download failed: {r.status_code}")
            
            current_img = Image.open(io.BytesIO(r.content))
            try: current_img = ImageOps.exif_transpose(current_img)
            except: pass
            icc_profile = current_img.info.get("icc_profile")
            
            if current_img.mode == 'RGBA':
                alpha = current_img.getchannel('A')
                current_img = current_img.convert("RGB")
            else: alpha = None

            # Poison Ivy (GPU)
            if req.config.get("apply_poison", True) or req.config.get("apply_concept_poison", False):
                job_states[str(req.artwork_id)].update({"message": "Generating adversarial noise (GPU)..."})
                buf = io.BytesIO()
                current_img.save(buf, format="PNG")
                
                try:
                    p_res = PoisonEngine().apply_poison.remote(buf.getvalue(), req.config, req.artwork_id)
                    # Support legacy byte return just in case, though we updated it.
                    if isinstance(p_res, dict):
                        result_bytes = p_res["data"]
                        # We can store metrics if we want
                        if not verifier_report: verifier_report = {}
                        if "metrics" in p_res: verifier_report["poison_metrics"] = p_res["metrics"]
                    else:
                        result_bytes = p_res
                        
                    current_img = Image.open(io.BytesIO(result_bytes))
                    if req.config.get("apply_poison", True): applied_methods.append("poison_ivy")
                    if req.config.get("apply_concept_poison", False): applied_methods.append("concept_cloak")
                except Exception as e:
                    logger.error(f"PoisonEngine Failed: {e}")
                    raise e

            # Watermarks (CPU)
            watermark_key = None
            if req.config.get("apply_watermark", True):
                job_states[str(req.artwork_id)].update({"message": "Injecting invisible watermark..."})
                key = req.config.get("secret_key") or str(uuid.uuid4())
                watermark_key = key
                current_img = apply_ssw_watermark(current_img, key, req.config.get("alpha", 0.012))
                applied_methods.append("ai_watermark")

            if req.config.get("apply_visual_watermark", False):
                current_img = apply_visual_watermark(current_img, req.config.get("watermark_text", "DRIMIT"))
                applied_methods.append("visual_watermark")

            if alpha:
                if alpha.size != current_img.size: alpha = alpha.resize(current_img.size, Image.Resampling.LANCZOS)
                current_img.putalpha(alpha)

            # Verification Step
            # Treated as a legitimate pipeline step: "apply_verification"
            should_verify = req.config.get("apply_verification", False) or req.verify_protection or req.is_preview
            
            if should_verify:
                # Ensure we are verifying a PROTECTED image
                if not applied_methods:
                     # "In case it doesn't find it, simply fail this step"
                     error_msg = "Verification ignored: No protection methods were applied to this image."
                     logger.warn(error_msg)
                     verifier_report = {"error": error_msg, "skipped": True}
                else:
                    job_states[str(req.artwork_id)].update({"message": "Running Verification Audit..."})
                    v_buf = io.BytesIO()
                    current_img.save(v_buf, format="PNG")
                    try:
                        verifier_report = VerifierEngine().verify_protection.remote(v_buf.getvalue(), req.artwork_id, config=req.config)
                        
                        applied_methods.append("verification_audit")
                    except Exception as ve:
                        logger.error(f"Verification Failed: {ve}")
                        verifier_report = {"error": str(ve)}
                        # Do not fail the whole job if audit fails, but record error.
            else:
                logger.info("Verification skipped (apply_verification=False)")

            # Upload
            out_buf = io.BytesIO()
            current_img.save(out_buf, format="PNG", icc_profile=icc_profile, optimize=True)
            out_bytes = out_buf.getvalue()
            
            bucket = R2_BUCKET_DEV if req.is_preview else R2_BUCKET_PROD
            
            # Hash logic
            url_path = req.image_url.split('?')[0]
            parts = url_path.split('/')
            upload_hash = next((p for p in parts if len(p) == 64 and all(c in '0123456789abcdefABCDEF' for c in p)), None)
            if not upload_hash: upload_hash = hashlib.sha256(r.content).hexdigest()
            
            protected_key = f"{req.user_id}/{upload_hash}/protected.png"
            logger.info(f"Uploading to {protected_key}")
            
            s3 = get_r2_client()
            s3.put_object(Bucket=bucket, Key=protected_key, Body=out_bytes, ContentType="image/png")
            
            # Handle Modified Variant (if Verification produced one)
            # Legacy: mimicry_bytes -> modified.png
            if verifier_report and "mimicry_bytes" in verifier_report:
                mimic_bytes = verifier_report.pop("mimicry_bytes")
                
                # Check if this object is identical to pixel bytes to avoid double memory
                is_pixel = "mimicry_pixel_bytes" in verifier_report and verifier_report["mimicry_pixel_bytes"] is mimic_bytes
                
                # New Structured Path: verified/pixel.png
                modified_pixel_key = f"{req.user_id}/{upload_hash}/verified/pixel.png"
                
                if mimic_bytes:
                    logger.info(f"Uploading modified variant (Pixel - Flux) to {modified_pixel_key}")
                    try:
                        s3.put_object(Bucket=bucket, Key=modified_pixel_key, Body=mimic_bytes, ContentType="image/png")
                        # Update report with key
                        verifier_report["primary_attack_key"] = modified_pixel_key
                        verifier_report["primary_attack_url"] = f"{os.environ['R2_PUBLIC_URL']}/{modified_pixel_key}"
                    except Exception as upload_e:
                        logger.error(f"Failed to upload modified variant: {upload_e}")
                else:
                    logger.warn("Mimicry bytes are None (attack failed?). Skipping upload.")
            
            # New Split: Clean up pixel bytes if they exist separately to avoid returning them in JSON
            if verifier_report and "mimicry_pixel_bytes" in verifier_report:
                verifier_report.pop("mimicry_pixel_bytes") 

            if verifier_report and "mimicry_sdxl_bytes" in verifier_report:
                sdxl_bytes = verifier_report.pop("mimicry_sdxl_bytes")
                if sdxl_bytes:
                    sdxl_key = f"{req.user_id}/{upload_hash}/verified/sdxl.png"
                    logger.info(f"Uploading modified variant (SDXL) to {sdxl_key}")
                    try:
                        s3.put_object(Bucket=bucket, Key=sdxl_key, Body=sdxl_bytes, ContentType="image/png")
                        verifier_report["secondary_attack_key"] = sdxl_key
                        verifier_report["secondary_attack_url"] = f"{os.environ['R2_PUBLIC_URL']}/{sdxl_key}"
                    except Exception as upload_e:
                        logger.error(f"Failed to upload SDXL variant: {upload_e}")
            
            if verifier_report and "mimicry_semantic_bytes" in verifier_report:
                semantic_bytes = verifier_report.pop("mimicry_semantic_bytes")
                if semantic_bytes:
                    semantic_key = f"{req.user_id}/{upload_hash}/verified/semantic.png"
                    logger.info(f"Uploading semantic recon variant (Flux Text) to {semantic_key}")
                    try:
                        s3.put_object(Bucket=bucket, Key=semantic_key, Body=semantic_bytes, ContentType="image/png")
                        verifier_report["semantic_attack_key"] = semantic_key
                        verifier_report["semantic_attack_url"] = f"{os.environ['R2_PUBLIC_URL']}/{semantic_key}"
                    except Exception as upload_e:
                        logger.error(f"Failed to upload semantic variant: {upload_e}")
            
            protected_url = f"{os.environ['R2_PUBLIC_URL']}/{protected_key}"
            status_code = "completed"
            file_meta = {"size": len(out_bytes), "width": current_img.width, "height": current_img.height}

        except Exception as e:
            logger.error(f"Job Failed: {e}")
            import traceback
            traceback.print_exc()
            error_msg = str(e)
            status_code = "failed"

        result = ProtectionResult(
            artwork_id=req.artwork_id,
            status=status_code,
            original_image_url=req.image_url,
            protected_image_url=protected_url,
            protected_image_key=protected_key,
            processing_time=time.time() - t0_total,
            file_metadata=file_meta,
            error_message=error_msg,
            applied_protections=applied_methods,
            verification_report=verifier_report
        )
        
        job_states[str(req.artwork_id)] = {
            "status": status_code, "updated_at": time.time(),
            "result": result.dict(), "error": error_msg
        }
        return result

@app.function(image=cpu_image, secrets=[modal.Secret.from_name("shield-secret")])
@modal.fastapi_endpoint(method="POST", label="drimit-shield-poisoning-submit-protection-job")
async def process(req: ProtectionRequest, auth: HTTPAuthorizationCredentials = Depends(auth_scheme)):
    token = os.environ.get("MODAL_AUTH_TOKEN", "").strip()
    if auth.credentials.strip() != token:
        raise HTTPException(status_code=401, detail="Unauthorized")
    job = ModelService().process_job.spawn(req)
    return {"status": "queued", "job_id": job.object_id, "artwork_id": req.artwork_id}

@app.function(image=cpu_image, secrets=[modal.Secret.from_name("shield-secret")])
@modal.fastapi_endpoint(method="POST", label="drimit-shield-poisoning-check-status")
async def check_status(req: BulkStatusRequest, auth: HTTPAuthorizationCredentials = Depends(auth_scheme)):
    if auth.credentials.strip() != os.environ.get("MODAL_AUTH_TOKEN", "").strip():
         raise HTTPException(status_code=401, detail="Unauthorized")
    
    results = {}
    for aid in req.artwork_ids:
        if aid in job_states: results[aid] = job_states[aid]
    
    if req.ack_ids:
        for aid in req.ack_ids:
            if aid in job_states: del job_states[aid]
    return results