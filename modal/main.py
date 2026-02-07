import modal
from fastapi import Request, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import io

# Define the image with dependencies
image = modal.Image.debian_slim().pip_install("fastapi[standard]", "Pillow", "requests")

app = modal.App("drimit-shield-demo", image=image)

auth_scheme = HTTPBearer()

@app.function(secrets=[modal.Secret.from_name("shield-secret")])
@modal.fastapi_endpoint(method="POST")
async def process_image(request: Request, token: HTTPAuthorizationCredentials = Depends(auth_scheme)):
    import os
    from PIL import Image, ImageOps
    import requests

    # Verify Auth Token
    if token.credentials != os.environ["AUTH_TOKEN"]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        content_type = request.headers.get("content-type", "")
        print(f"[Modal] Received request. Content-Type: {content_type}")
        img_data = None
        start_process = 0 # timestamp placeholder

        if "application/json" in content_type:
            body = await request.json()
            image_url = body.get("image_url")
            
            if not image_url:
                 print("[Modal] JSON Error: image_url missing")
                 raise HTTPException(status_code=400, detail="image_url is required")
            
            print(f"[Modal] Fetching image from URL: {image_url}")
            
            # Download Image
            # Note: In production this should handle timeouts, large files, etc.
            response = requests.get(image_url, stream=True, timeout=10)
            response.raise_for_status()
            img_data = response.content
            print(f"[Modal] Downloaded {len(img_data)} bytes")
        else:
            print("[Modal] Reading raw image bytes from body stream")
            img_data = await request.body()
            print(f"[Modal] Body read complete. Size: {len(img_data)} bytes")
            
        if not img_data:
             raise HTTPException(status_code=400, detail="No image data provided")
        
        # Open Image
        img = Image.open(io.BytesIO(img_data))
        print(f"[Modal] Image opened. Format: {img.format}, Size: {img.size}")
        
        # Process: Convert to Grayscale -> Invert (Negative)
        # This simulates "protection" modification
        import time
        t0 = time.time()
        img_gray = ImageOps.grayscale(img)
        img_inverted = ImageOps.invert(img_gray)
        dt = time.time() - t0
        print(f"[Modal] Processing complete in {dt:.4f}s")
        
        # Save to buffer
        output_buffer = io.BytesIO()
        img_inverted.save(output_buffer, format=img.format or "PNG")
        output_data = output_buffer.getvalue()
        
        print(f"[Modal] Sending response. Size: {len(output_data)} bytes")
        
        # Return raw bytes? Or base64? 
        # Returning raw bytes with FastAPI/Modal:
        from fastapi import Response
        return Response(content=output_data, media_type=f"image/{img.format.lower() if img.format else 'png'}")
        
    except Exception as e:
        print(f"[Modal] Error processing image: {e}")
        raise HTTPException(status_code=500, detail=str(e))
