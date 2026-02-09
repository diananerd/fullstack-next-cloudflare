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

# --- Inlined Types ---

class ProtectionRequest(BaseModel):
    image_url: str
    artwork_id: str
    user_id: str
    method: str = "watermark" 
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

# App Declaration
app = modal.App("drimit-shield-watermark")

# Persistent state
job_states = modal.Dict.from_name("shield-job-states", create_if_missing=True)

# Image definition with Fonts
watermark_image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install("fonts-dejavu-core") # Install fonts for PIL
    .pip_install(
        "fastapi[standard]", 
        "requests", 
        "Pillow", 
        "boto3"
    )
)

app.image = watermark_image

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
    cpu=1.0, 
    timeout=600,
    secrets=[
        modal.Secret.from_name("shield-secret"),
        modal.Secret.from_name("cloudflare-r2-secret")
    ],
    max_containers=5,
    min_containers=0
)
class WatermarkApp:
    @modal.method()
    def process_job(self, req: ProtectionRequest) -> ProtectionResult:
        import requests
        from PIL import Image, ImageDraw, ImageFont, ImageColor
        import math
        
        t0_total = time.time()
        print(f"[Modal] [Watermark] Processing job for artwork: {req.artwork_id}")
        
        job_states[str(req.artwork_id)] = {
            "status": "processing", 
            "started_at": t0_total,
            "artwork_id": req.artwork_id,
            "method": "watermark"
        }

        try:
            # 1. Download Input Image
            print(f"[Modal] Downloading message from: {req.image_url}")
            headers = {"User-Agent": "DrimitShield/1.0"}
            if "/api/assets/" in req.image_url:
                 token = os.environ.get("AUTH_TOKEN") or os.environ.get("MODAL_AUTH_TOKEN")
                 if token:
                     headers["Authorization"] = f"Bearer {token}"
            
            r = requests.get(req.image_url, headers=headers, stream=True, timeout=60)
            if r.status_code != 200:
                 raise Exception(f"Download Message Failed: {r.status_code}")

            # 2. Open Image
            img = Image.open(io.BytesIO(r.content)).convert("RGBA")
            width, height = img.size
            
            # Save original hash
            buf_orig = io.BytesIO()
            img.save(buf_orig, format="PNG")
            input_bytes = buf_orig.getvalue()
            input_sha256 = hashlib.sha256(input_bytes).hexdigest()

            # 3. Apply Watermark
            print(f"[Modal] Applying Watermark...")
            t0_worker = time.time()
            
            # Config
            text = req.config.get("text", "DRIMIT SHIELD")
            opacity = req.config.get("opacity", 128) # 0-255 (128 = ~50%)
            font_size_ratio = req.config.get("font_ratio", 0.05) # Font size relative to image width
            
            # Create a watermark layer
            txt_layer = Image.new("RGBA", img.size, (255, 255, 255, 0))
            draw = ImageDraw.Draw(txt_layer)
            
            # Font Setup
            font_size = int(width * font_size_ratio)
            if font_size < 20: font_size = 20
            
            try:
                # Try to use DejaVuSans-Bold (assuming apt_install worked)
                font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", font_size)
            except IOError:
                print("Warning: Custom font not found, using default.")
                font = ImageFont.load_default()

            # Measure text size
            bbox = draw.textbbox((0, 0), text, font=font)
            text_width = bbox[2] - bbox[0]
            text_height = bbox[3] - bbox[1]
            
            # Create a single tile for the text to handle rotation cleanly
            # We make it large enough to hold the rotated text
            tile_size = int(max(text_width, text_height) * 1.5)
            # Ensure tile is square and big enough
            
            # New approach: Draw text repeatedly on a large canvas, then rotate?
            # Or draw rotated text?
            # Requirement: "Mosaico repetitivo en diagonal ascendente (45 deg)"
            
            # Let's create a transparent square tile with the text centered
            # Then we can rotate this tile 45 degrees? No, the text itself should be readable but arranged in diagonal lines?
            # Usually "diagonal watermark" means the text itself is rotated 45 degrees.
            
            # 1. Create a tile with the text rotated 45 degrees
            # Enlarge canvas for rotation without clipping
            angle = 45
            
            # Hypotenuse for spacing
            spacing_x = int(text_width * 1.5)
            spacing_y = int(text_height * 4.0) # Vertical spacing between lines
            
            # Create a separate image for the text
            txt_img = Image.new('RGBA', (text_width + 20, text_height + 20), (255, 255, 255, 0))
            d = ImageDraw.Draw(txt_img)
            d.text((10, 10), text, font=font, fill=(255, 255, 255, int(opacity)))
            
            # Rotate the text image
            rotated_txt = txt_img.rotate(angle, expand=True, resample=Image.Resampling.BICUBIC)
            
            # Tile the rotated text across the image
            # We need to cover (0,0) to (width, height)
            
            # Draw on the main layer
            # Simple tiling strategy:
            tile_w, tile_h = rotated_txt.size
            gap_x = 100
            gap_y = 100
            
            for y in range(-tile_h, height + tile_h, tile_h + gap_y):
                for x in range(-tile_w, width + tile_w, tile_w + gap_x):
                    # Offset every other row for brick pattern effect (optional but looks better)
                    offset_x = (y // (tile_h + gap_y)) * (tile_w // 2)
                    
                    txt_layer.paste(rotated_txt, (x + offset_x, y), rotated_txt)

            # Composite
            out = Image.alpha_composite(img, txt_layer)
            
            # Prepare output
            if out.mode != "RGB":
                out = out.convert("RGB") # Remove alpha for final usage if needed (or keep PNG)
                
            buf_out = io.BytesIO()
            out.save(buf_out, format="PNG")
            output_bytes = buf_out.getvalue()
            
            dt_worker = time.time() - t0_worker
            print(f"[Modal] Watermark finished in {dt_worker:.2f}s")
             
            # 4. Upload
            from urllib.parse import urlparse
            path = urlparse(req.image_url).path 
            parent_dir = os.path.dirname(path)
            image_hash = os.path.basename(parent_dir)
            output_key = f"{image_hash}/watermark.png"
            output_sha256 = hashlib.sha256(output_bytes).hexdigest()
            
            target_bucket = R2_BUCKET_DEV if req.is_preview else R2_BUCKET_PROD
            
            s3 = get_r2_client()
            s3.put_object(
                Bucket=target_bucket,
                Key=output_key,
                Body=output_bytes,
                ContentType='image/png'
            )
            
            protected_url = f"{os.environ['R2_PUBLIC_URL']}/{output_key}" 
            
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
            
            job_states[str(req.artwork_id)] = {
                "status": "failed", 
                "error": str(e),
                "failed_at": time.time()
            }
            return error_result

@app.function()
@modal.fastapi_endpoint(method="POST")
async def check_status(req: BulkStatusRequest):
    if req.ack_ids:
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
            "method": "watermark"
        }

        worker = WatermarkApp()
        call = worker.process_job.spawn(req)
        
        current_state = job_states[str(req.artwork_id)]
        current_state["job_id"] = call.object_id
        job_states[str(req.artwork_id)] = current_state
        
        print(f"[Modal] Spawned WatermarkApp job: {call.object_id}")
    except Exception as e:
        print(f"[Modal] FAILED to spawn WatermarkApp: {e}")
        raise HTTPException(status_code=500, detail=f"Spawn failed: {str(e)}")
    
    return {
        "status": "queued", 
        "artwork_id": req.artwork_id, 
        "job_id": call.object_id,
        "message": "Job submitted successfully"
    }
