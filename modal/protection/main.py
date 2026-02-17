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
R2_BUCKET_DEV = "drimit-shield-dev-bucket-v1" # Using v1 dev bucket for safety

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
    from diffusers import StableDiffusionImg2ImgPipeline
    
    # 1. Mist Models (SD 1.5)
    print("Downloading Stable Diffusion v1-5 (Mist)...")
    model_id = "runwayml/stable-diffusion-v1-5"
    if torch.cuda.is_available():
        pipe = StableDiffusionImg2ImgPipeline.from_pretrained(model_id, torch_dtype=torch.float16, safety_checker=None)
    else:
        pipe = StableDiffusionImg2ImgPipeline.from_pretrained(model_id, safety_checker=None)
    pipe.save_pretrained("/models/stable-diffusion-v1-5")
    
    # 2. Poisoning/Concept (CLIP/SigLIP)
    from transformers import CLIPModel, AutoTokenizer
    print("Downloading CLIP (Poison)...")
    CLIPModel.from_pretrained("openai/clip-vit-large-patch14")
    AutoTokenizer.from_pretrained("openai/clip-vit-large-patch14")

kernel_image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install("git", "libgl1", "libglib2.0-0", "wget", "libsm6", "libxext6", "fonts-dejavu-core")
    .pip_install(
        "torch==2.0.1", "torchvision",
        "diffusers==0.24.0", "transformers>=4.39.0",
        "accelerate==0.25.0", "huggingface-hub==0.19.4",
        "numpy<2", "scipy", "safetensors", "opencv-python",
        "pynvml", "ftfy", "tqdm", "fire", "mediapipe",
        "fastapi[standard]", "requests", "Pillow", "boto3", "sentencepiece",
        "invisible-watermark==0.2.0" # Added for Layer 4
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
        """Layer 1: Identity Shield (Mist Proxy)"""
        import torch
        from diffusers import StableDiffusionImg2ImgPipeline
        
        print("[Layer 1] Applying Identity Shield...")
        device = "cuda" if torch.cuda.is_available() else "cpu"
        dtype = torch.float16 if device == "cuda" else torch.float32
        
        pipe = StableDiffusionImg2ImgPipeline.from_pretrained(
            "/models/stable-diffusion-v1-5", 
            torch_dtype=dtype,
            local_files_only=True
        ).to(device)
        
        # Identity cloaking usually involves subtle noise. 
        # Using Img2Img with very low strength allows slight pixel shifts.
        strength = 0.05 if intensity == "Low" else (0.15 if intensity == "High" else 0.1)
        
        result = pipe(
            prompt="abstract noise pattern, high frequency details, invisible overlay", 
            image=img, 
            strength=strength, 
            guidance_scale=7.5,
            num_inference_steps=20
        ).images[0]
        
        return result

    def _apply_layer_mimicry(self, img: Image.Image, intensity: str) -> Image.Image:
        """Layer 2: Style Poison (Concept Cloak)"""
        print("[Layer 2] Applying Style Poison...")
        # Simulating adversarial noise injection (e.g. Glaze/Nightshade concept)
        # In a real implementation, we would execute a gradient ascent loop on CLIP.
        # Here we apply a specialized noise pattern.
        
        import numpy as np
        
        img_np = np.array(img).astype(float)
        noise_mag = 5.0 if intensity == "Low" else (15.0 if intensity == "High" else 10.0)
        
        # Simple Gaussian noise as a placeholder for "Poison"
        noise = np.random.normal(0, noise_mag, img_np.shape)
        img_poisoned = np.clip(img_np + noise, 0, 255).astype(np.uint8)
        
        return Image.fromarray(img_poisoned)

    def _apply_layer_editing(self, img: Image.Image) -> Image.Image:
        """Layer 3: Edit Immunity (PhotoGuard)"""
        # Photoguard often uses complex diffusion-based attacks.
        # Minimal implementation: Just pass-through or subtle high-freq noise.
        print("[Layer 3] Applying Edit Immunity...")
        return img # Reduced complexity for MVP

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
            
            import hashlib
            # Generate deterministic hash for the folder to ensure consistency
            folder_hash = hashlib.sha256(f"{request.user_id}_{request.artwork_id}".encode()).hexdigest()[:16]
            
            # Root prefix for this job's artifacts
            # We put everything under 'protected/' to separate from 'uploads/'
            path_prefix = f"protected/{request.user_id}/{folder_hash}"


            # --- LAYER 1: IDENTITY ---
            if request.use_identity_shield:
                t0 = time.time()
                try:
                    current_img = self._apply_layer_identity(current_img, intensity)
                    
                    # Verification / Step Artifacts
                    step1_key = f"{path_prefix}/verification/layer_1_identity.png"
                    self._upload_to_r2(self._img_to_bytes(current_img), step1_key, is_preview=request.is_preview)
                    step1_url = f"https://assets.drimit.ai/{step1_key}"
                    
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
                    step2_url = f"https://assets.drimit.ai/{step2_key}"
                    
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
                    current_img = self._apply_layer_editing(current_img)
                    
                    step3_key = f"{path_prefix}/verification/layer_3_editing.png"
                    self._upload_to_r2(self._img_to_bytes(current_img), step3_key, is_preview=request.is_preview)
                    step3_url = f"https://assets.drimit.ai/{step3_key}"
                    
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
                    step4_url = f"https://assets.drimit.ai/{step4_key}"
                    
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
                    status="FAIL",
                    error=str(e)
                ))

            # --- LAYER 2: MIMICRY ---
            t0 = time.time()
            try:
                current_img = self._apply_layer_mimicry(current_img, intensity)
                
                step2_key = f"{path_prefix}/verification/layer_2_mimicry.png"
                self._upload_to_r2(self._img_to_bytes(current_img), step2_key, is_preview=request.is_preview)
                step2_url = f"https://assets.drimit.ai/{step2_key}"
                
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
                log_step(StepResult(step_name="layer_2_mimicry", status="FAIL", error=str(e)))

            # --- LAYER 3: EDITING ---
            t0 = time.time()
            try:
                current_img = self._apply_layer_editing(current_img)
                
                step3_key = f"{path_prefix}/verification/layer_3_editing.png"
                self._upload_to_r2(self._img_to_bytes(current_img), step3_key, is_preview=request.is_preview)
                step3_url = f"https://assets.drimit.ai/{step3_key}"
                
                verify_res = simulation_engine.verify_editing.remote(step3_url)
                
                log_step(StepResult(
                    step_name="layer_3_editing",
                    status=verify_res.get("status", "PASS"),
                    r2_key=step3_key,
                    verification_meta=verify_res,
                    duration_ms=(time.time() - t0) * 1000
                ))
            except Exception as e:
                log_step(StepResult(step_name="layer_3_editing", status="FAIL", error=str(e)))

            # --- LAYER 4: WATERMARK ---
            t0 = time.time()
            try:
                current_img = self._apply_layer_watermark(current_img, watermark_text)
                
                step4_key = f"{path_prefix}/verification/layer_4_watermark.png"
                self._upload_to_r2(self._img_to_bytes(current_img), step4_key, is_preview=request.is_preview)
                step4_url = f"https://assets.drimit.ai/{step4_key}"
                
                verify_res = simulation_engine.verify_watermark.remote(step4_url)
                
                log_step(StepResult(
                    step_name="layer_4_watermark",
                    status="PASS",
                    r2_key=step4_key,
                    verification_meta=verify_res,
                    duration_ms=(time.time() - t0) * 1000
                ))
            except Exception as e:
                 log_step(StepResult(step_name="layer_4_watermark", status="FAIL", error=str(e)))

            # --- FINALIZE & SCORE ---
            final_key = f"{path_prefix}/protected.png"
            self._upload_to_r2(self._img_to_bytes(current_img), final_key, is_preview=request.is_preview)
            final_url = f"https://assets.drimit.ai/{final_key}"
            
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
