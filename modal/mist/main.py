import modal
from fastapi import Request, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import io
import os
import subprocess
import shutil
import time
import hashlib
import json
import uuid
from urllib.parse import urlparse
from typing import Dict, Any, Optional
from pydantic import BaseModel

# --- Inlined Types ---

class ProtectionRequest(BaseModel):
    image_url: str
    artwork_id: str
    user_id: str
    method: str = "mist" # Default to mist
    config: Dict[str, Any] = {}
    is_preview: bool = False # Detect if request comes from dev environment

class ProtectionResult(BaseModel):
    artwork_id: str
    status: str
    original_image_url: str
    protected_image_url: Optional[str] = None
    protected_image_key: Optional[str] = None
    processing_time: float
    file_metadata: Dict[str, Any] = {} # sha256, size, width, height
    error_message: Optional[str] = None

class BulkStatusRequest(BaseModel):
    artwork_ids: list[str]
    ack_ids: Optional[list[str]] = None # IDs to remove from state (cleanup)

# ---------------------

# Config
R2_BUCKET_PROD = "drimit-shield-bucket"
R2_BUCKET_DEV = "drimit-shield-dev-bucket"

# App Declaration
app = modal.App("drimit-shield-demo")

# Persistent state for job tracking (retains data even if app restarts)
job_states = modal.Dict.from_name("shield-job-states", create_if_missing=True)

# 1. Define Image specifically for Mist (Heavy: CUDA, Pytorch, Diffusers)
def download_mist_models():
    # Pre-download SD 1.5 to cache in the image
    from diffusers import StableDiffusionPipeline
    import torch
    print("Downloading Stable Diffusion v1-5...")
    model_id = "runwayml/stable-diffusion-v1-5"
    local_dir = "/models/stable-diffusion-v1-5"
    if not torch.cuda.is_available():
        print("Warning: CUDA not available for download script")
    
    pipe = StableDiffusionPipeline.from_pretrained(model_id, torch_dtype=torch.float16)
    pipe.save_pretrained(local_dir)
    print(f"Model saved to {local_dir}")

mist_image = (
    modal.Image.debian_slim(python_version="3.10")
    # System dependencies
    .apt_install("git", "libgl1", "libglib2.0-0", "wget", "libsm6", "libxext6")
    # Python dependencies (Heavy Stack)
    .pip_install(
        "torch==2.0.1",
        "torchvision",
        "diffusers==0.24.0", 
        "transformers==4.35.2",
        "datasets",
        "accelerate==0.25.0",
        "huggingface-hub==0.19.4",
        "numpy<2",
        "scipy", 
        "safetensors", 
        "opencv-python",
        "pynvml",
        "colorama",
        "ftfy",
        "tqdm",
        "fire",
        "mediapipe",
        "wandb",
        "tensorboard",
        "torchmetrics",
        "xformers==0.0.20",
        "fastapi[standard]", 
        "requests", 
        "Pillow", 
        "boto3"
    )
    .run_commands("git clone https://github.com/psyker-team/mist-v2 /mist-v2")
    .run_function(download_mist_models, gpu="any") 
)

app.image = mist_image

# Setting up auth
auth_scheme = HTTPBearer()

# R2 Client Helper
def get_r2_client():
    import boto3
    return boto3.client(
        "s3",
        endpoint_url=os.environ["R2_ENDPOINT"],
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
    )

@app.cls(
    gpu="T4", # Using GPU directly for the main class to avoid cold starts or separation
    timeout=1200, # 20 min max (Increased from 10m to handle large/slow batches)
    secrets=[
        modal.Secret.from_name("shield-secret"),
        modal.Secret.from_name("cloudflare-r2-secret")
    ],
    max_containers=2,
    min_containers=0
)
class MistApp:
    @modal.method()
    def process_job(self, req: ProtectionRequest) -> ProtectionResult:
        import requests
        from PIL import Image
        
        t0_total = time.time()
        print(f"[Modal] [Monolith] Processing job for artwork: {req.artwork_id}")
        
        # Track state: PROCESSING
        job_states[str(req.artwork_id)] = {
            "status": "processing", 
            "started_at": t0_total,
            "artwork_id": req.artwork_id,
            "method": "mist"
        }

        try:
            # 1. Download Input Image
            # Logic: 
            # - IF url matches shield.drimit.io/api/assets/ -> It's the proxy. Use HTTP + Auth Token.
            # - IF url contains R2 endpoint -> It is internal? (Likely not used now).
            
            print(f"[Modal] Downloading message from: {req.image_url}")
            
            headers = {
                 "User-Agent": "DrimitShield/1.0"
            }
            
            # If it is our internal proxy, we MUST provide the auth token
            if "/api/assets/" in req.image_url:
                 token = os.environ.get("AUTH_TOKEN") or os.environ.get("MODAL_AUTH_TOKEN")
                 if token:
                     headers["Authorization"] = f"Bearer {token}"
                     print("[Modal] Added Bearer Token for Asset Proxy")
            
            r = requests.get(req.image_url, headers=headers, stream=True, timeout=60)
            
            if r.status_code != 200:
                 # Debug: Print first 500 chars of response to see if it's an Auth error page
                 print(f"[Modal] Download Error Body: {r.text[:500]}")
                 raise Exception(f"Download Message Failed: {r.status_code}")

            # 2. Pre-processing (Resize/Convert)
            img = Image.open(io.BytesIO(r.content))
            
            # Ensure RGB
            if img.mode != "RGB":
                 img = img.convert("RGB")

            # Max dim check
            max_dim = 1280
            if max(img.size) > max_dim:
                ratio = max_dim / max(img.size)
                new_size = (int(img.width * ratio), int(img.height * ratio))
                img = img.resize(new_size, Image.Resampling.LANCZOS)

            width, height = img.size
            
            # Save to bytes for processing
            buf = io.BytesIO()
            img.save(buf, format="PNG")
            input_bytes = buf.getvalue()
            
            # Calculate Input Hash
            input_sha256 = hashlib.sha256(input_bytes).hexdigest()
            
            # 3. RUN MIST ATTACK (Directly here)
            print(f"[Modal] Running Mist Attack...")
            t0_worker = time.time()
            
            # Setup temporal paths
            req_id = str(uuid.uuid4())
            base_dir = f"/tmp/{req_id}"
            input_dir = f"{base_dir}/input"
            output_dir = f"{base_dir}/output"
            class_dir = f"{base_dir}/class"
            os.makedirs(input_dir, exist_ok=True)
            os.makedirs(output_dir, exist_ok=True)
            os.makedirs(class_dir, exist_ok=True)
            
            output_bytes = None
            
            try:
                # Write input
                input_path = f"{input_dir}/image.png"
                with open(input_path, "wb") as f:
                    f.write(input_bytes)
                
                # Mist Command configuration
                max_steps = str(req.config.get("steps", 3))
                epsilon = str(req.config.get("epsilon", 0.0627))
                
                cmd = [
                    "accelerate", "launch", 
                    "--num_processes=1",
                    "/mist-v2/attacks/mist.py",
                    "--cuda",
                    "--low_vram_mode",
                    "--pretrained_model_name_or_path", "/models/stable-diffusion-v1-5",
                    "--instance_data_dir", input_dir,
                    "--class_data_dir", class_dir,
                    "--output_dir", output_dir,
                    "--max_train_steps", max_steps,
                    "--max_adv_train_steps", "20",
                    "--pgd_eps", epsilon,
                    "--resolution", "512",
                    "--mixed_precision", "fp16"
                ]
                
                # Run
                result = subprocess.run(
                    cmd, 
                    capture_output=True, 
                    text=True,
                    cwd="/mist-v2", 
                    env={**os.environ, "HF_HUB_OFFLINE": "1"}
                )
                
                if result.returncode != 0:
                    print(f"[Mist] Stderr: {result.stderr[-1000:]}")
                    raise Exception(f"Mist Error (Exit {result.returncode})")
                
                # Read Output
                output_files = [f for f in os.listdir(output_dir) if f.endswith(".png")]
                if not output_files:
                    raise Exception("No output generated from Mist")
                    
                with open(f"{output_dir}/{output_files[0]}", "rb") as f:
                    output_bytes = f.read()
                    
            finally:
                import shutil
                shutil.rmtree(base_dir, ignore_errors=True)

            dt_worker = time.time() - t0_worker
            print(f"[Modal] Mist finished in {dt_worker:.2f}s")

            # Request contains user_id and artwork_id. 
            # We must ensure the output key follows the pattern: {user_id}/{hash}/protected.png
            
            parsed_url = urlparse(req.image_url)
            path = parsed_url.path 
            
            # path e.g. /api/assets/<userId>/<hash>/original.png
            # We extract the hash from the path.
            # Assuming standard structure: .../assets/.../<userId>/<hash>/<filename>
            # Let's be robust: get the parent directory structure
            
            parent_dir = os.path.dirname(path) # .../<userId>/<hash>
            image_hash = os.path.basename(parent_dir) # <hash>
            
            # Fallback if hash lookup fails or structure is weird (old structure support?)
            # If the path is just /assets/<hash>/original (old), we might not have user_id in path
            # But we HAVE user_id in req.
            
            output_key = f"{req.user_id}/{image_hash}/protected.png"

            # Compute hash for metadata only, not filename
            output_sha256 = hashlib.sha256(output_bytes).hexdigest()
            
            target_bucket = R2_BUCKET_DEV if req.is_preview else R2_BUCKET_PROD
            print(f"[Modal] Uploading result to R2 ({target_bucket}): {output_key}")
            
            s3 = get_r2_client()
            s3.put_object(
                Bucket=target_bucket,
                Key=output_key,
                Body=output_bytes,
                ContentType='image/png'
            )
            
            # Use App Proxy URL
            app_url = os.environ.get("APP_URL", "https://shield.drimit.io")
            protected_url = f"{app_url}/api/assets/{output_key}"
            
            total_duration = time.time() - t0_total
            print(f"[Modal] Job completed: {protected_url}")
            
            result_obj = ProtectionResult(
                artwork_id=req.artwork_id,
                status="completed",
                original_image_url=req.image_url,
                protected_image_url=protected_url,
                protected_image_key=output_key,
                processing_time=total_duration,
                file_metadata={
                    "width": width,
                    "height": height,
                    "size_bytes": len(output_bytes),
                    "input_sha256": input_sha256,
                    "output_sha256": output_sha256,
                    "worker_time_seconds": dt_worker
                }
            )

            # Track state: COMPLETED
            job_states[str(req.artwork_id)] = {
                "status": "completed", 
                "result": result_obj.dict(),
                "completed_at": time.time()
            }
            
            return result_obj

        except Exception as e:
            print(f"[Modal] [ERROR] Job failed: {e}")
            import traceback
            traceback.print_exc()

            error_result = ProtectionResult(
                artwork_id=req.artwork_id,
                status="failed",
                original_image_url=req.image_url,
                processing_time=time.time() - t0_total,
                error_message=str(e)
            )
            
            # Track state: FAILED
            job_states[str(req.artwork_id)] = {
                "status": "failed", 
                "error": str(e),
                "failed_at": time.time()
            }
            return error_result

@app.function()
@modal.fastapi_endpoint(method="POST")
async def check_status(req: BulkStatusRequest):
    """
    Check the status of multiple protection jobs at once.
    Also handles 'ack' (cleanup) of finished jobs to keep the state clean.
    """
    # 1. Handle Cleanup (ACK)
    if req.ack_ids:
        print(f"[CheckStatus] Cleaning up {len(req.ack_ids)} acknowledged jobs")
        for aid in req.ack_ids:
            try:
                job_states.pop(aid) # Remove from Dict
            except KeyError:
                pass

    # 2. Handle Status Check
    print(f"[CheckStatus] Checking {len(req.artwork_ids)} artworks")
    results = {}
    for aid in req.artwork_ids:
        state = job_states.get(aid)
        if state:
            results[aid] = state
        else:
             results[aid] = {"status": "unknown", "artwork_id": aid}
    return results

@app.function(
    secrets=[modal.Secret.from_name("shield-secret")]
)
@modal.fastapi_endpoint(method="POST")
async def submit_protection_job(req: ProtectionRequest, token: HTTPAuthorizationCredentials = Depends(auth_scheme)):
    # Validate method - Only allow Mist
    if req.method == "watermark":
         return {
             "status": "failed",
             "message": "Watermark method disabled in monolithic mode"
         }

    if token.credentials != os.environ["AUTH_TOKEN"]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    print(f"[Modal] Received submission for artwork {req.artwork_id} (Monolith / Mist)")
    
    # Spawn the Monolith Worker
    try:
        # Initialize state as QUEUED immediately
        job_states[str(req.artwork_id)] = {
            "status": "queued",
            "submitted_at": time.time(),
            "job_id": "pending-spawn" 
        }

        worker = MistApp()
        call = worker.process_job.spawn(req)
        
        # Update with actual Job ID
        current_state = job_states[str(req.artwork_id)]
        current_state["job_id"] = call.object_id
        job_states[str(req.artwork_id)] = current_state
        
        print(f"[Modal] Spawned MistApp job: {call.object_id}")
    except Exception as e:
        print(f"[Modal] FAILED to spawn MistApp: {e}")
        raise HTTPException(status_code=500, detail=f"Spawn failed: {str(e)}")
    
    return {
        "status": "queued", 
        "artwork_id": req.artwork_id, 
        "job_id": call.object_id,
        "message": "Job submitted successfully"
    }
