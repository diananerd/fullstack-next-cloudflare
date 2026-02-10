import modal
from fastapi import Request, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import io
import os
import time
import hashlib
import uuid
from typing import Dict, Any, Optional
from pydantic import BaseModel

# --- Inlined Types (Duplicated to avoid shared dependency issues for now) ---

class ProtectionRequest(BaseModel):
    image_url: str
    artwork_id: str
    user_id: str
    method: str = "grayscale" # Default to grayscale
    config: Dict[str, Any] = {}
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

class BulkStatusRequest(BaseModel):
    artwork_ids: list[str]
    ack_ids: Optional[list[str]] = None

# ---------------------

# Config
R2_BUCKET_PROD = "drimit-shield-bucket"
R2_BUCKET_DEV = "drimit-shield-dev-bucket"

# App Declaration - Separate App Name
app = modal.App("drimit-shield-grayscale")

# Persistent state - Shared with the main app if desired, or separate. 
# Using the same name allows a unified dashboard/status check if permissions allow.
job_states = modal.Dict.from_name("shield-job-states", create_if_missing=True)

# Lighter Image for Grayscale
grayscale_image = (
    modal.Image.debian_slim(python_version="3.10")
    .pip_install(
        "fastapi[standard]", 
        "requests", 
        "Pillow", 
        "boto3"
    )
)

app.image = grayscale_image

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
    cpu=1.0, # No GPU needed for grayscale
    timeout=600,
    secrets=[
        modal.Secret.from_name("shield-secret"),
        modal.Secret.from_name("cloudflare-r2-secret")
    ],
    max_containers=5, # Lightweight, can scale more
    min_containers=0
)
class GrayscaleApp:
    @modal.method()
    def process_job(self, req: ProtectionRequest) -> ProtectionResult:
        import requests
        from PIL import Image
        
        t0_total = time.time()
        print(f"[Modal] [Grayscale] Processing job for artwork: {req.artwork_id}")
        
        # Track state: PROCESSING
        job_states[str(req.artwork_id)] = {
            "status": "processing", 
            "started_at": t0_total,
            "artwork_id": req.artwork_id,
            "method": "grayscale"
        }

        try:
            # 1. Download Input Image
            print(f"[Modal] Downloading message from: {req.image_url}")
            
            headers = {
                 "User-Agent": "DrimitShield/1.0"
            }
            
            if "/api/assets/" in req.image_url:
                 token = os.environ.get("AUTH_TOKEN") or os.environ.get("MODAL_AUTH_TOKEN")
                 if token:
                     headers["Authorization"] = f"Bearer {token}"
            
            r = requests.get(req.image_url, headers=headers, stream=True, timeout=60)
            
            if r.status_code != 200:
                 print(f"[Modal] Download Error Body: {r.text[:500]}")
                 raise Exception(f"Download Message Failed: {r.status_code}")

            # 2. Processing (Grayscale)
            img = Image.open(io.BytesIO(r.content))
            
            # Ensure RGB first to handle palette/transparent issues commonly
            if img.mode != "RGB":
                 img = img.convert("RGB")
            
            width, height = img.size
            
            # Save original hash
            buf_orig = io.BytesIO()
            img.save(buf_orig, format="PNG")
            input_bytes = buf_orig.getvalue()
            input_sha256 = hashlib.sha256(input_bytes).hexdigest()

            # CONVERT TO GRAYSCALE
            print(f"[Modal] Converting to Grayscale...")
            t0_worker = time.time()
            
            img_gray = img.convert("L") # L mode = 8-bit pixels, black and white
            
            buf_out = io.BytesIO()
            img_gray.save(buf_out, format="PNG")
            output_bytes = buf_out.getvalue()
            
            dt_worker = time.time() - t0_worker
            print(f"[Modal] Grayscale finished in {dt_worker:.2f}s")

            # 3. Post-processing & Upload
            from urllib.parse import urlparse
            
            # Request contains user_id and artwork_id. 
            # We must ensure the output key follows the pattern: {user_id}/{hash}/protected.png
            
            parsed_url = urlparse(req.image_url)
            path = parsed_url.path 
            
            parent_dir = os.path.dirname(path) # .../<userId>/<hash>
            image_hash = os.path.basename(parent_dir) # <hash>
            
            output_key = f"{req.user_id}/{image_hash}/protected.png"

            # Compute hash for metadata only, not filename
            output_sha256 = hashlib.sha256(output_bytes).hexdigest()
            
            parsed_url = urlparse(req.image_url)
            path = parsed_url.path 
            
            # Assume Bundle Structure: Parent folder is the Hash
            parent_dir = os.path.dirname(path)
            image_hash = os.path.basename(parent_dir)
            output_key = f"{image_hash}/protected.png"

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
            
            # Use App Proxy URL instead of R2 Public URL to ensure access to private bucket
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
    Check status - Shared State
    """
    if req.ack_ids:
        print(f"[CheckStatus] Cleaning up {len(req.ack_ids)} acknowledged jobs")
        for aid in req.ack_ids:
            try:
                job_states.pop(aid) 
            except KeyError:
                pass

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
    # Validate method
    if req.method not in ["grayscale", "mist"]: # Allow mist fallback if client sends it, but process as grayscale? Or fail?
         # If this is specifically the grayscale app, maybe we should enforce it.
         pass 

    if token.credentials != os.environ["AUTH_TOKEN"]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    print(f"[Modal] Received submission for artwork {req.artwork_id} (Method: {req.method})")
    
    try:
        job_states[str(req.artwork_id)] = {
            "status": "queued",
            "submitted_at": time.time(),
            "job_id": "pending-spawn",
            "method": "grayscale"
        }

        worker = GrayscaleApp()
        call = worker.process_job.spawn(req)
        
        current_state = job_states[str(req.artwork_id)]
        current_state["job_id"] = call.object_id
        job_states[str(req.artwork_id)] = current_state
        
        print(f"[Modal] Spawned GrayscaleApp job: {call.object_id}")
    except Exception as e:
        print(f"[Modal] FAILED to spawn GrayscaleApp: {e}")
        raise HTTPException(status_code=500, detail=f"Spawn failed: {str(e)}")
    
    return {
        "status": "queued", 
        "artwork_id": req.artwork_id, 
        "job_id": call.object_id,
        "message": "Job submitted successfully"
    }
