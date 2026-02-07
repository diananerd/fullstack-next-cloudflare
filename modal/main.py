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
from typing import Dict, Any

from common.types import ProtectionRequest, ProtectionResult

# Config
R2_BUCKET = "drimit-shield-bucket"

# Define the image with dependencies for Mist v2
def download_models():
    # Pre-download SD 1.5 to cache in the image
    from diffusers import StableDiffusionPipeline
    import torch
    print("Downloading Stable Diffusion v1-5...")
    model_id = "runwayml/stable-diffusion-v1-5"
    local_dir = "/models/stable-diffusion-v1-5"
    pipe = StableDiffusionPipeline.from_pretrained(model_id, torch_dtype=torch.float16)
    pipe.save_pretrained(local_dir)
    print(f"Model saved to {local_dir}")

image = (
    modal.Image.debian_slim(python_version="3.10")
    # System dependencies for OpenCV and Git
    .apt_install("git", "libgl1", "libglib2.0-0", "wget")
    # Python dependencies
    .pip_install(
        "fastapi[standard]", 
        "Pillow", 
        "requests",
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
        "boto3"
    )
    # Clone Mist v2 repository
    .run_commands("git clone https://github.com/psyker-team/mist-v2 /mist-v2")
    # Copy common types (Needs to be before run_function so main imports work)
    .add_local_dir("modal/common", remote_path="/root/common", copy=True)
    # Pre-cache model
    .run_function(download_models, gpu="any")
)

app = modal.App("drimit-shield-demo", image=image)

# R2 Client Helper
def get_r2_client():
    import boto3
    return boto3.client(
        "s3",
        endpoint_url=os.environ["R2_ENDPOINT"],
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
    )


auth_scheme = HTTPBearer()

@app.cls(
    secrets=[
        modal.Secret.from_name("shield-secret"),
        modal.Secret.from_name("cloudflare-r2-secret")
    ],
    gpu="T4",
    timeout=3600, # 1 hour timeout for queue processing
    max_containers=5 # Limit concurrent GPU jobs
)
class MistProcessor:
    @modal.method()
    async def process_job(self, req: ProtectionRequest) -> ProtectionResult:
        import requests
        from PIL import Image
        import uuid
        
        t0_total = time.time()
        print(f"[Modal] Processing job for artwork: {req.artwork_id}")

        req_id = str(uuid.uuid4())
        base_dir = f"/tmp/{req_id}"
        input_dir = f"{base_dir}/input"
        output_dir = f"{base_dir}/output"
        class_dir = f"{base_dir}/class"
        os.makedirs(input_dir, exist_ok=True)
        os.makedirs(output_dir, exist_ok=True)
        os.makedirs(class_dir, exist_ok=True)

        try:
            # 1. Download Input Image
            print(f"[Modal] Downloading message from: {req.image_url}")
            
            # Auth header for accessing protected assets
            headers = {}
            if "AUTH_TOKEN" in os.environ:
                 headers["Authorization"] = f"Bearer {os.environ['AUTH_TOKEN']}"
                 print(f"[Modal] Added Authorization header for download")
            else:
                 print(f"[Modal] WARNING: AUTH_TOKEN not found in env")

            r = requests.get(req.image_url, stream=True, timeout=30, headers=headers)
            try:
                r.raise_for_status()
            except requests.exceptions.HTTPError as e:
                print(f"[Modal] Download failed. Status: {r.status_code}")
                print(f"[Modal] Response Body: {r.text}")
                raise e
            
            input_path = f"{input_dir}/image.png"
            with open(input_path, "wb") as f:
                for chunk in r.iter_content(chunk_size=8192):
                    f.write(chunk)
            
            # 2. Calculate input metadata
            file_stats = os.stat(input_path)
            input_size = file_stats.st_size
            
            with Image.open(input_path) as img:
                # Ensure RGB
                if img.mode != "RGB":
                    img = img.convert("RGB")
                    img.save(input_path)

                # Resize if too large (Max 1280px to prevent OOM on T4)
                # Mist v2 is based on SD 1.5 which is native 512x512. 
                # Going too high will crash VRAM during gradient computation.
                max_dim = 1280
                if max(img.size) > max_dim:
                   ratio = max_dim / max(img.size)
                   new_size = (int(img.width * ratio), int(img.height * ratio))
                   print(f"[Modal] Resizing image from {img.size} to {new_size} for stability")
                   img = img.resize(new_size, Image.LANCZOS)
                   img.save(input_path)

                width, height = img.size
                
            input_sha256 = hashlib.sha256()
            with open(input_path, "rb") as f:
                for byte_block in iter(lambda: f.read(4096), b""):
                    input_sha256.update(byte_block)
            
            # 3. Running Mist v2
            # Extract config with defaults
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
                "--mixed_precision", "fp16",
                # "--wandb_disable"  # Removed: Not supported by argparser
            ]
            
            print(f"[Modal] Executing Mist: {' '.join(cmd)}")
            t0_mist = time.time()
            
            env = os.environ.copy()
            env["HF_HUB_OFFLINE"] = "1" 
            
            result = subprocess.run(
                cmd, 
                capture_output=True, 
                text=True,
                cwd="/mist-v2", 
                env=env
            )
            
            dt_mist = time.time() - t0_mist
            print(f"[Modal] Mist execution finished in {dt_mist:.2f}s")
            
            if result.returncode != 0:
                print(f"[Modal] Mist STDERR: {result.stderr}")
                raise Exception(f"Mist process failed (Exit {result.returncode}): {result.stderr[-500:]}")

            # 4. Process Output
            output_files = [f for f in os.listdir(output_dir) if f.endswith(".png")]
            if not output_files:
                raise Exception("No output image generated successfully.")
            
            output_filename = output_files[0]
            output_path = f"{output_dir}/{output_filename}"
            
            # Verify valid image
            with Image.open(output_path) as img:
                img.verify()
                
            # Calculates SHA256 of result
            output_sha256 = hashlib.sha256()
            with open(output_path, "rb") as f:
                file_data = f.read()
                output_sha256.update(file_data)
                
            # 5. Upload to R2
            s3 = get_r2_client()
            # Simplified path structure: protected/{sha256}.png
            output_key = f"protected/{output_sha256.hexdigest()}.png"
            
            print(f"[Modal] Uploading result to R2: {output_key}")
            s3.put_object(
                Bucket=R2_BUCKET,
                Key=output_key,
                Body=file_data,
                ContentType='image/png'
            )
            
            # Construct public URL (assuming configured custom domain or R2 dev URL)
            protected_url = f"{os.environ['R2_PUBLIC_URL']}/{output_key}" 
            
            total_duration = time.time() - t0_total
            print(f"[Modal] Job completed successfully. URL: {protected_url}")
            
            result_obj = ProtectionResult(
                artwork_id=req.artwork_id,
                status="completed",
                original_image_url=req.image_url,
                protected_image_url=protected_url,
                processing_time=total_duration,
                file_metadata={
                    "width": width,
                    "height": height,
                    "size_bytes": len(file_data),
                    "input_sha256": input_sha256.hexdigest(),
                    "output_sha256": output_sha256.hexdigest(),
                    "mist_time_seconds": dt_mist
                }
            )
            
            # Send Webhook if configured
            if req.callback_url:
                print(f"[Modal] Sending callback to: {req.callback_url}")
                try:
                    headers = {"Content-Type": "application/json"}
                    if req.webhook_secret:
                        headers["Authorization"] = f"Bearer {req.webhook_secret}"
                        
                    requests.post(req.callback_url, json=result_obj.dict(), headers=headers, timeout=10)
                except Exception as e:
                     print(f"[Modal] Callback failed: {e}")

            return result_obj

        except Exception as e:
            print(f"[Modal] Job failed: {str(e)}")
            # Cleanup
            shutil.rmtree(base_dir, ignore_errors=True)
            
            error_result = ProtectionResult(
                artwork_id=req.artwork_id,
                status="failed",
                original_image_url=req.image_url,
                processing_time=time.time() - t0_total,
                error_message=str(e)
            )
            
            if req.callback_url:
                try:
                    headers = {"Content-Type": "application/json"}
                    if req.webhook_secret:
                        headers["Authorization"] = f"Bearer {req.webhook_secret}"
                    requests.post(req.callback_url, json=error_result.dict(), headers=headers, timeout=10)
                except:
                    pass
            
            return error_result
        finally:
            shutil.rmtree(base_dir, ignore_errors=True)

@app.function(
    secrets=[modal.Secret.from_name("shield-secret")]
)
@modal.fastapi_endpoint(method="POST")
async def submit_protection_job(req: ProtectionRequest, token: HTTPAuthorizationCredentials = Depends(auth_scheme)):
    if token.credentials != os.environ["AUTH_TOKEN"]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    print(f"[Modal] Received submission for artwork {req.artwork_id}")
    call = MistProcessor().process_job.spawn(req)
    
    return {
        "status": "queued", 
        "artwork_id": req.artwork_id, 
        "job_id": call.object_id,
        "message": "Job submitted successfully"
    }

