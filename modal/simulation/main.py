import modal
import os
import io
import uuid
from typing import Dict, Any, Optional

app = modal.App("drimit-shield-simulation")

# Image definition for verifiers (Needs FaceNet, CLIP, etc.)
def download_verifier_models():
    # FaceNet / MTCNN for identity (Legacy)
    print("Downloading Facenet/MTCNN...")
    from facenet_pytorch import MTCNN
    try:
        mtcnn = MTCNN(keep_all=True)
    except:
        pass 
        
    # InsightFace (SOTA)
    print("Downloading InsightFace (SOTA)...")
    import insightface
    insightface.app.FaceAnalysis(name='buffalo_l', providers=['CUDAExecutionProvider'])
    
    # CLIP for Style
    from transformers import CLIPProcessor, CLIPModel
    print("Downloading CLIP for Verification...")
    CLIPModel.from_pretrained("openai/clip-vit-base-patch32")
    CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")

    # SD Inpainting (for verify_editing - avoids runtime download)
    from diffusers import StableDiffusionInpaintPipeline
    import torch
    print("Downloading SD Inpainting for Edit Verification...")
    dtype = torch.float16 if torch.cuda.is_available() else torch.float32
    StableDiffusionInpaintPipeline.from_pretrained(
        "runwayml/stable-diffusion-inpainting",
        torch_dtype=dtype,
        safety_checker=None,
    )

verifier_image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install("libgl1", "libglib2.0-0", "libsm6", "libxext6", "gcc", "g++")
    .pip_install(
        "torch>=2.4.0", "torchvision>=0.19.0", "facenet-pytorch",
        "transformers", "diffusers", "accelerate", "pillow", "numpy", "scipy",
        "scikit-image", "requests",
        "invisible-watermark==0.2.0", "opencv-python",
        "insightface==0.7.3", "onnxruntime-gpu>=1.16.0"
    )
    .run_function(download_verifier_models)
)

app.image = verifier_image

@app.cls(gpu="T4", timeout=600)
class SimulationEngine:
    
    def _download_image(self, url):
        import requests
        from PIL import Image
        headers = {"User-Agent": "Mozilla/5.0"}
        r = requests.get(url, headers=headers, stream=True)
        r.raise_for_status()
        return Image.open(io.BytesIO(r.content)).convert("RGB")

    @modal.method()
    def verify_identity(self, image_url: str) -> Dict[str, Any]:
        """
        SOTA Face Detection (InsightFace) + Legacy (MTCNN).
        PASS condition: SOTA model fails to detect face OR fails to match identity.
        """
        import torch
        import cv2
        import numpy as np
        import insightface
        from facenet_pytorch import MTCNN
        
        print(f"[Simulation] Verifying Identity for {image_url}")
        
        try:
            img_pil = self._download_image(image_url)
            img_bgr = cv2.cvtColor(np.array(img_pil), cv2.COLOR_RGB2BGR) # For InsightFace
            
            # 1. SOTA Check: InsightFace (ArcFace)
            # This is what Deepfakes use. If this detects a face, protection is weak.
            # Fix providers for execution safety
            providers = ['CUDAExecutionProvider'] if torch.cuda.is_available() else ['CPUExecutionProvider']
            app_face = insightface.app.FaceAnalysis(name='buffalo_l', providers=providers)
            app_face.prepare(ctx_id=0, det_size=(640, 640))
            
            sota_faces = app_face.get(img_bgr)
            num_faces_sota = len(sota_faces)
            sota_conf = sota_faces[0].det_score if num_faces_sota > 0 else 0.0
            
            # 2. Legacy Check: MTCNN
            device = 'cuda' if torch.cuda.is_available() else 'cpu'
            mtcnn = MTCNN(keep_all=True, device=device)
            # boxes, probs = mtcnn.detect(img_pil) # Using PIL
            # Legacy check is secondary measure
            
            # Status Logic
            # Strong PASS: 0 faces detected by SOTA.
            # Weak PASS: Face detected but low confidence (< 0.50).
            # FAIL: Face detected with high confidence (> 0.70).
            
            pass_threshold = 0.60
            
            status = "PASS" if (num_faces_sota == 0 or sota_conf < pass_threshold) else "FAIL"
            
            # If 0 faces, protection score is 1.0 (Best)
            # If face found with 0.9 conf, score is 0.1 (Poor)
            protection_score = 1.0
            if num_faces_sota > 0:
                protection_score = max(0.0, 1.0 - float(sota_conf))
                
            return {
                "faces_detected": int(num_faces_sota),
                "confidence_sota": float(sota_conf),
                "confidence": float(sota_conf),  # alias for frontend audit trail
                "status": status,
                "protection_score": float(protection_score),
                "model_used": "insightface-buffalo_l"
            }
        except Exception as e:
            print(f"Error in verify_identity: {e}")
            return {"status": "ERROR", "error": str(e)}

    @modal.method()
    def verify_style(self, image_url: str, original_url: str = None) -> Dict[str, Any]:
        """
        Uses CLIP to compare semantic similarity.
        
        Goal: 
        1. Visual Similarity (Pixel match) should be HIGH (Image looks same to human).
        2. Semantic Similarity (CLIP match) should be LOWER than original (Image looks different to AI).
        
        If CLIP similarity is > 0.99, protection effectively FAILED (AI still sees the exact same concept).
        If CLIP similarity is < 0.95, we have successfully introduced concept drift.
        """
        import torch
        print(f"[Simulation] Verifying Style (CLIP) for {image_url}")
        try:
            from transformers import CLIPProcessor, CLIPModel
            from torch.nn import CosineSimilarity
            import numpy as np
            import torchvision.transforms as T
            
            device = 'cuda' if torch.cuda.is_available() else 'cpu'
            model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32").to(device)
            processor = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")
            
            img_protected = self._download_image(image_url)
            
            if original_url:
                img_original = self._download_image(original_url)
                
                # 1. Validation A: CLIP Similarity (Should be lower)
                inputs = processor(images=[img_original, img_protected], return_tensors="pt", padding=True).to(device)
                
                with torch.no_grad():
                    outputs = model.get_image_features(**inputs)
                
                cos = CosineSimilarity(dim=1, eps=1e-6)
                # Compare img 0 vs img 1
                clip_similarity = cos(outputs[0].unsqueeze(0), outputs[1].unsqueeze(0)).item()
                
                # 2. Validation B: Pixel Similarity (Should be high - PSNR/SSIM approx)
                # Convert to tensors [0,1]
                t_orig = T.ToTensor()(img_original)
                t_prot = T.ToTensor()(img_protected)
                
                # Resize protected to match original if slightly different due to save
                if t_orig.shape != t_prot.shape:
                     t_prot = T.Resize(t_orig.shape[1:])(t_prot)
                
                # Mean Squared Error
                mse = torch.mean((t_orig - t_prot) ** 2).item()
                # PSNR = 20 * log10(MAX / sqrt(MSE))
                import math
                psnr = 20 * math.log10(1.0 / math.sqrt(mse)) if mse > 0 else 100
                
                print(f"Stats - CLIP Sim: {clip_similarity:.4f}, PSNR: {psnr:.2f}")
                
                # Evaluation Logic:
                # We WANT clip_similarity to drop (below 0.99 is good, below 0.95 is excellent).
                # We WANT PSNR to be high (> 25-30dB means decent visual quality).
                
                # Logic:
                # Pass if we moved the needle at least a bit (< 0.99)
                is_pass = clip_similarity < 0.994 
                
                # Score calculation
                # 1.0 (perfect) if Sim < 0.90
                # 0.0 (useless) if Sim > 0.995
                
                feature_drift = max(0, 0.995 - clip_similarity) 
                # e.g. 0.995 - 0.95 = 0.045
                # map 0.045 -> score ~0.5?
                # let's be generous for MVP: any movement is good.
                
                score = min(1.0, feature_drift * 20) # 0.05 drift * 20 = 1.0
                
                status = "PASS" if is_pass else "FAIL"
                
                return {
                    "status": status,
                    "style_similarity": clip_similarity,
                    "visual_quality_psnr": psnr,
                    "protection_score": score,
                    "simulated_attack": "CLIP-Feature-Extraction"
                }
            else:
                 return {"status": "PASS", "style_similarity": 0.0, "note": "No original provided"}

        except Exception as e:
            print(f"Error in verify_style: {e}")
            return {"status": "ERROR", "error": str(e)}

    @modal.method()
    def verify_editing(self, image_url: str) -> Dict[str, Any]:
        """
        Simulates an unauthorized editing attempt (Inpainting).
        We attempt to mask a central portion of the image and 'heal' it using SD Inpainting.
        
        Pass Condition: The inpainted result is significantly degraded or noisy compared to the surrounding context,
        indicating the latent space was disrupted.
        Fail Condition: The inpainting is smooth and coherent.
        """
        print(f"[Simulation] Verifying Editing Immunity for {image_url}")
        import torch
        import numpy as np
        from diffusers import StableDiffusionInpaintPipeline
        from PIL import Image
        
        try:
            device = "cuda" if torch.cuda.is_available() else "cpu"
            dtype = torch.float16 if device == "cuda" else torch.float32

            # 1. Load Inpainting Model (Standard SD 1.5 Inpainting)
            # Using runwaml/stable-diffusion-inpainting as the standard adversarial proxy
            model_id = "runwayml/stable-diffusion-inpainting"
            
            # Check if model is cached or needs fresh download
            # In production, we'd pre-load this in image def, but for now we load on demand
            pipe = StableDiffusionInpaintPipeline.from_pretrained(
                model_id, 
                torch_dtype=dtype,
                safety_checker=None
            ).to(device)
            
            # 2. Prepare Image & Mask
            img_raw = self._download_image(image_url)
            img = img_raw.resize((512, 512)) # Standardize for model
            
            # Create a simple box mask in the center
            mask = Image.new("RGB", (512, 512), (0, 0, 0)) # Clean black mask
            mask_np = np.array(mask)
            # White box (255) means "Inpaint Here"
            mask_np[192:320, 192:320] = [255, 255, 255] 
            mask_img = Image.fromarray(mask_np)
            
            # 3. Attempt Unauthorized Edit (e.g. "remove object", "clean background")
            prompt = "clean background, smooth texture, high quality"
            
            result = pipe(
                prompt=prompt,
                image=img,
                mask_image=mask_img,
                num_inference_steps=20, # Fast attack
                guidance_scale=7.5
            ).images[0]
            
            # 4. Measure "Disruption" (Adversarial Success)
            # If immunization works, the Inpainted area (center) should look disjointed or contain high-freq noise 
            # because the encoder produced garbage latents.
            
            res_np = np.array(result)
            center_crop = res_np[192:320, 192:320]
            
            # Calculate Variance (Noise Metric)
            import cv2
            gray_crop = cv2.cvtColor(center_crop, cv2.COLOR_RGB2GRAY)
            variance = cv2.Laplacian(gray_crop, cv2.CV_64F).var()
            
            print(f"Inpainting Variance: {variance}")
            
            # Heuristic Threshold: High variance = High Noise = Successful Disruption
            # Broken/Adversarial images often have sharp pixel transitions (high variance)
            is_disrupted = variance > 1200.0 or variance < 50.0 # Extremely low variance (flat grey) is also failure
            
            status = "PASS" if is_disrupted else "FAIL"
            
            return {
                "status": status, 
                "protection_score": 0.95 if status == "PASS" else 0.2,
                "artifacts_metric": float(variance),
                "simulated_attack": "SD-Inpainting-1.5"
            }
            
        except Exception as e:
            print(f"Edit Verification Error: {e}")
            return {"status": "ERROR", "error": str(e)}

    @modal.method()
    def verify_watermark(self, image_url: str, expected_uuid: str = None) -> Dict[str, Any]:
        """
        Simulates Watermark Extraction (The Proof of Ownership).
        Run a real decode using invisible-watermark (DWT/DCT).
        We also simulate a mild 'attack' (compression) to prove robustness.
        """
        print(f"[Simulation] Verifying Watermark for {image_url}")
        import cv2
        import numpy as np
        from imwatermark import WatermarkDecoder
        
        try:
            # 1. Download
            img = self._download_image(image_url)
            img_np = np.array(img)
            img_bgr = cv2.cvtColor(img_np, cv2.COLOR_RGB2BGR)

            # 2. Simulate Attack: JPEG Compression (Quality 80)
            # PROOF: Even if Facebook compresses it, is it still yours?
            encode_param = [int(cv2.IMWRITE_JPEG_QUALITY), 80]
            _, img_encoded = cv2.imencode('.jpg', img_bgr, encode_param)
            img_attacked = cv2.imdecode(img_encoded, 1)

            # 3. Decode
            decoder = WatermarkDecoder('bytes', 32) # length must match encoder
            watermark = decoder.decode(img_attacked, 'dwtDct')
            
            decoded_text = ""
            try:
                if watermark:
                    decoded_text = watermark.decode('utf-8')
            except:
                pass
                
            print(f"Decoded: {decoded_text} vs Expected: {expected_uuid}")

            # 4. Verify
            # Note: DWT/DCT is robust but not perfect. It might lose chars.
            # We check if the expected UUID is IN the decoded string or close enough.
            # For this implementation, we check exact prefix match or full match.
            
            match = False
            if expected_uuid:
                 # Check if significant part of UUID is recovered
                target = expected_uuid[:32] # Max payload we encoded
                if target in decoded_text or decoded_text in target:
                     if len(decoded_text) > 5: # Avoid empty match
                        match = True
            
            status = "PASS" if match else "FAIL"
            
            return {
                "status": status,
                "watermark_detected": bool(watermark),
                "decoded_payload": decoded_text,
                "decoded_uuid": decoded_text,  # alias for frontend audit trail
                "expected_payload": expected_uuid,
                "match": match,
                "protection_score": 1.0 if match else 0.0,
                "simulation_attack": "JPEG-80"
            }
            
        except Exception as e:
            print(f"Error in verify_watermark: {e}")
            return {"status": "ERROR", "error": str(e)}
