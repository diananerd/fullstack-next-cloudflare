import modal
import os
import io
import uuid
from typing import Dict, Any, Optional

app = modal.App("drimit-shield-simulation")

# Image definition for verifiers
def download_verifier_models():
    import os
    import torch

        print("HuggingFace login successful.")

    # 1. InsightFace buffalo_l (legacy identity verifier)
    # Use CPUExecutionProvider during build: the image build container is CPU-only.
    # CUDAExecutionProvider would raise an ONNX session error (no GPU), causing a misleading
    # exception even though files are downloaded correctly before session init.
    # At runtime (T4 GPU) verify_identity creates a new FaceAnalysis with CUDAExecutionProvider.
    print("Downloading InsightFace buffalo_l...")
    import insightface
    try:
        app_bl = insightface.app.FaceAnalysis(name='buffalo_l', providers=['CPUExecutionProvider'])
        app_bl.prepare(ctx_id=0, det_size=(640, 640))
        print("buffalo_l cached.")
    except Exception as e:
        print(f"buffalo_l warning: {e}")

    # 2. InsightFace antelopev2 (primary identity verifier — ArcFace R100)
    print("Downloading InsightFace antelopev2...")
    try:
        app_v2 = insightface.app.FaceAnalysis(name='antelopev2', providers=['CPUExecutionProvider'])
        app_v2.prepare(ctx_id=0, det_size=(640, 640))
        print("antelopev2 cached.")
    except Exception as e:
        print(f"antelopev2 warning: {e}")

    # 3. CLIP ViT-L/14 (style verifier legacy)
    from transformers import CLIPProcessor, CLIPModel
    print("Downloading CLIP ViT-L/14...")
    CLIPModel.from_pretrained("openai/clip-vit-large-patch14")
    CLIPProcessor.from_pretrained("openai/clip-vit-large-patch14")

    # 4. OpenCLIP ViT-H/14 (style verifier primary)
    print("Downloading OpenCLIP ViT-H/14...")
    try:
        import open_clip
        open_clip.create_model_and_transforms('ViT-H-14', pretrained='laion2b_s32b_b79k')
        print("OpenCLIP ViT-H/14 cached.")
    except Exception as e:
        print(f"OpenCLIP ViT-H/14 warning: {e}")

    # 5. FLUX VAE (editing verifier primary + style latent drift)
    from diffusers import AutoencoderKL
    print("Downloading FLUX VAE (16-ch)...")
    try:
        AutoencoderKL.from_pretrained(
            "black-forest-labs/FLUX.1-schnell", subfolder="vae", torch_dtype=torch.float32
        )
        print("FLUX VAE cached.")
    except Exception as e:
        print(f"FLUX VAE warning: {e}")

    # 6. SD 1.5 Inpainting (editing verifier legacy)
    from diffusers import StableDiffusionInpaintPipeline
    print("Downloading SD 1.5 Inpainting...")
    dtype = torch.float16 if torch.cuda.is_available() else torch.float32
    StableDiffusionInpaintPipeline.from_pretrained(
        "runwayml/stable-diffusion-inpainting", torch_dtype=dtype, safety_checker=None,
    )

    # 7. TrustMark (watermark verifier)
    print("Downloading TrustMark-C...")
    try:
        from trustmark import TrustMark
        TrustMark(verbose=False, model_type='C')
        print("TrustMark-C cached.")
    except Exception as e:
        print(f"TrustMark warning: {e}")

verifier_image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install("libgl1", "libglib2.0-0", "libsm6", "libxext6", "gcc", "g++")
    .pip_install(
        "torch>=2.6.0,<2.8.0", "torchvision>=0.21.0,<0.23.0",
        "transformers>=4.41.0,<5.0.0", "diffusers>=0.30.0,<0.35.0", "accelerate>=0.26.0,<2.0.0",
        "pillow", "numpy<2", "scipy", "requests",
        "open_clip_torch",
        "trustmark",
        "opencv-python", "boto3",
        "insightface==0.7.3", "onnxruntime-gpu>=1.16.0,<2.0.0"
    )
    .run_function(
        download_verifier_models,
        secrets=[modal.Secret.from_name("shield-secret")]
    )
)

app.image = verifier_image

R2_BUCKET_PROD = "drimit-shield-bucket"
R2_BUCKET_DEV  = "drimit-shield-dev-bucket"

@app.cls(
    gpu="T4",
    timeout=600,
    secrets=[
        modal.Secret.from_name("shield-secret"),
        modal.Secret.from_name("cloudflare-r2-secret"),
    ]
)
class SimulationEngine:

    def _download_image(self, url):
        import requests
        from PIL import Image
        headers = {"User-Agent": "Mozilla/5.0"}
        r = requests.get(url, headers=headers, stream=True)
        r.raise_for_status()
        return Image.open(io.BytesIO(r.content)).convert("RGB")

    def _get_r2_client(self):
        import boto3
        endpoint = os.environ.get("R2_ENDPOINT")
        if not endpoint and os.environ.get("CLOUDFLARE_ACCOUNT_ID"):
            endpoint = f"https://{os.environ['CLOUDFLARE_ACCOUNT_ID']}.r2.cloudflarestorage.com"
        return boto3.client(
            "s3",
            endpoint_url=endpoint,
            aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
            aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
            region_name="auto",
        )

    def _upload_to_r2(self, image_bytes: bytes, key: str, content_type="image/png", is_preview=False):
        s3 = self._get_r2_client()
        bucket = R2_BUCKET_DEV if is_preview else R2_BUCKET_PROD
        try:
            s3.put_object(Bucket=bucket, Key=key, Body=image_bytes, ContentType=content_type)
            return key
        except Exception as e:
            print(f"[SimEngine] R2 upload failed ({bucket}/{key}): {e}")
            return None

    def _pil_to_bytes(self, img, fmt="PNG") -> bytes:
        buf = io.BytesIO()
        img.save(buf, format=fmt)
        return buf.getvalue()

    @modal.method()
    def verify_identity(self, image_url: str, original_url: str = None) -> Dict[str, Any]:
        """v3 dual-run identity verification.

        Runs antelopev2 (primary) and buffalo_l (legacy) on BOTH the original
        and protected images, returning baseline/protected/delta for each model.
        """
        import torch
        import cv2
        import numpy as np
        import insightface

        print(f"[Simulation] verify_identity v3: {image_url}")

        def detect_faces(app_face, bgr_img):
            faces = app_face.get(bgr_img)
            n = len(faces)
            conf = float(faces[0].det_score) if n > 0 else 0.0
            return n, conf

        try:
            providers = ['CUDAExecutionProvider'] if torch.cuda.is_available() else ['CPUExecutionProvider']

            img_prot_pil = self._download_image(image_url)
            img_prot_bgr = cv2.cvtColor(np.array(img_prot_pil), cv2.COLOR_RGB2BGR)

            img_orig_bgr = None
            if original_url:
                try:
                    img_orig_pil = self._download_image(original_url)
                    img_orig_bgr = cv2.cvtColor(np.array(img_orig_pil), cv2.COLOR_RGB2BGR)
                except Exception as e:
                    print(f"[verify_identity] Could not load original: {e}")

            results = {}

            # --- antelopev2 (primary — ArcFace R100 / InstantID / ReActor era) ---
            try:
                app_v2 = insightface.app.FaceAnalysis(name='antelopev2', providers=providers)
                app_v2.prepare(ctx_id=0, det_size=(640, 640))

                n_orig_v2, conf_orig_v2 = detect_faces(app_v2, img_orig_bgr) if img_orig_bgr is not None else (0, 0.0)
                n_prot_v2, conf_prot_v2 = detect_faces(app_v2, img_prot_bgr)
                drop_v2 = conf_orig_v2 - conf_prot_v2

                results["latest"] = {
                    "model": "antelopev2",
                    "baseline": {"faces_detected": n_orig_v2, "confidence": conf_orig_v2},
                    "protected": {"faces_detected": n_prot_v2, "confidence": conf_prot_v2},
                    "confidence_drop": drop_v2,
                }
                del app_v2
            except Exception as e:
                print(f"[verify_identity] antelopev2 error: {e}")

            # --- buffalo_l (legacy) ---
            try:
                app_bl = insightface.app.FaceAnalysis(name='buffalo_l', providers=providers)
                app_bl.prepare(ctx_id=0, det_size=(640, 640))

                n_orig_bl, conf_orig_bl = detect_faces(app_bl, img_orig_bgr) if img_orig_bgr is not None else (0, 0.0)
                n_prot_bl, conf_prot_bl = detect_faces(app_bl, img_prot_bgr)
                drop_bl = conf_orig_bl - conf_prot_bl

                results["legacy"] = {
                    "model": "buffalo_l",
                    "baseline": {"faces_detected": n_orig_bl, "confidence": conf_orig_bl},
                    "protected": {"faces_detected": n_prot_bl, "confidence": conf_prot_bl},
                    "confidence_drop": drop_bl,
                }
                del app_bl
            except Exception as e:
                print(f"[verify_identity] buffalo_l error: {e}")

            # Flatten backward-compat keys from primary (antelopev2) or fall back to legacy
            primary = results.get("latest") or results.get("legacy", {})
            prot_entry = primary.get("protected", {})
            faces_detected = prot_entry.get("faces_detected", 0)
            confidence     = prot_entry.get("confidence", 0.0)
            confidence_drop = primary.get("confidence_drop", 0.0)
            protection_score = max(0.0, 1.0 - confidence)

            pass_threshold = 0.60
            status = "PASS" if (faces_detected == 0 or confidence < pass_threshold) else "FAIL"

            return {
                **results,
                # backward-compat flat keys
                "faces_detected": int(faces_detected),
                "confidence": float(confidence),
                "confidence_drop": float(confidence_drop),
                "protection_score": float(protection_score),
                "status": status,
            }
        except Exception as e:
            print(f"[verify_identity] Error: {e}")
            return {"status": "ERROR", "error": str(e)}

    @modal.method()
    def verify_style(self, image_url: str, original_url: str = None) -> Dict[str, Any]:
        """v3 dual-run style verification.

        - OpenCLIP ViT-H/14 (primary): SDXL/IP-Adapter image encoder class
        - CLIP ViT-L/14 (legacy): classic image retrieval proxy
        - FLUX VAE latent drift: proxy for LoRA-based style mimicry disruption
        """
        import torch
        import torchvision.transforms as T
        import math
        import numpy as np
        from torch.nn import CosineSimilarity

        print(f"[Simulation] verify_style v3: {image_url}")

        if not original_url:
            return {"status": "PASS", "style_similarity": 0.0, "note": "No original provided"}

        try:
            device = 'cuda' if torch.cuda.is_available() else 'cpu'
            cos = CosineSimilarity(dim=1, eps=1e-6)

            normalizer = T.Normalize(
                mean=[0.48145466, 0.4578275, 0.40821073],
                std=[0.26862954, 0.26130258, 0.27577711]
            )
            resizer_224 = T.Resize((224, 224), interpolation=T.InterpolationMode.BICUBIC, antialias=True)

            img_original  = self._download_image(original_url)
            img_protected = self._download_image(image_url)

            t_orig = T.ToTensor()(img_original).unsqueeze(0).to(device)
            t_prot = T.ToTensor()(img_protected).unsqueeze(0).to(device)
            if t_orig.shape != t_prot.shape:
                t_prot = T.Resize(t_orig.shape[2:])(t_prot)

            results = {}

            # --- OpenCLIP ViT-H/14 (primary) ---
            try:
                import open_clip
                clip_h, _, _ = open_clip.create_model_and_transforms(
                    'ViT-H-14', pretrained='laion2b_s32b_b79k'
                )
                clip_h = clip_h.to(device).eval()
                with torch.no_grad():
                    emb_orig_h = clip_h.encode_image(normalizer(resizer_224(t_orig)))
                    emb_prot_h = clip_h.encode_image(normalizer(resizer_224(t_prot)))
                sim_h = cos(emb_orig_h, emb_prot_h).item()
                results["latest"] = {
                    "model": "openclip-vit-h14",
                    "baseline_self_similarity": 1.0,
                    "protected_similarity": sim_h,
                    "drift": 1.0 - sim_h,
                }
                del clip_h
                torch.cuda.empty_cache()
            except Exception as e:
                print(f"[verify_style] OpenCLIP ViT-H/14 error: {e}")

            # --- CLIP ViT-L/14 (legacy) ---
            try:
                from transformers import CLIPModel, CLIPProcessor
                clip_l = CLIPModel.from_pretrained("openai/clip-vit-large-patch14").to(device)
                proc_l = CLIPProcessor.from_pretrained("openai/clip-vit-large-patch14")
                inputs = proc_l(images=[img_original, img_protected], return_tensors="pt", padding=True).to(device)
                with torch.no_grad():
                    feats = clip_l.get_image_features(**inputs)
                sim_l = cos(feats[0].unsqueeze(0), feats[1].unsqueeze(0)).item()
                results["legacy"] = {
                    "model": "clip-vit-l14",
                    "protected_similarity": sim_l,
                    "drift": 1.0 - sim_l,
                }
                del clip_l
                torch.cuda.empty_cache()
            except Exception as e:
                print(f"[verify_style] CLIP ViT-L/14 error: {e}")

            # --- FLUX VAE latent drift (proxy for LoRA style disruption) ---
            flux_vae_latent_drift = None
            try:
                from diffusers import AutoencoderKL
                resize_512 = T.Resize((512, 512), interpolation=T.InterpolationMode.BICUBIC, antialias=True)
                # Normalise to [-1, 1]
                t_orig_vae = resize_512(t_orig) * 2 - 1
                t_prot_vae = resize_512(t_prot) * 2 - 1
                flux_vae = AutoencoderKL.from_pretrained(
                    "black-forest-labs/FLUX.1-schnell", subfolder="vae", torch_dtype=torch.float32
                ).to(device)
                flux_vae.eval()
                with torch.no_grad():
                    z_orig = flux_vae.encode(t_orig_vae).latent_dist.mean
                    z_prot = flux_vae.encode(t_prot_vae).latent_dist.mean
                flux_vae_latent_drift = torch.mean((z_prot - z_orig) ** 2).item()
                del flux_vae
                torch.cuda.empty_cache()
            except Exception as e:
                print(f"[verify_style] FLUX VAE latent drift error: {e}")

            # --- PSNR ---
            mse = torch.mean((t_orig.cpu() - t_prot.cpu()) ** 2).item()
            psnr = 20 * math.log10(1.0 / math.sqrt(mse)) if mse > 0 else 100.0

            # Use primary model (ViT-H/14) or fall back to legacy for flat keys
            primary = results.get("latest") or results.get("legacy", {})
            style_similarity = primary.get("protected_similarity", 1.0)
            feature_drift = max(0.0, 0.995 - style_similarity)
            score = min(1.0, feature_drift * 20)
            status = "PASS" if style_similarity < 0.994 else "FAIL"

            return {
                **results,
                # backward-compat flat keys
                "style_similarity": style_similarity,
                "flux_vae_latent_drift": flux_vae_latent_drift,
                "visual_quality_psnr": psnr,
                "protection_score": score,
                "status": status,
            }
        except Exception as e:
            print(f"[verify_style] Error: {e}")
            return {"status": "ERROR", "error": str(e)}

    @modal.method()
    def verify_editing(
        self,
        image_url: str,
        original_url: str = None,
        path_prefix: str = None,
        is_preview: bool = False,
    ) -> Dict[str, Any]:
        """v3 dual-run editing verification.

        Test 1 — FLUX VAE proxy: encode original + protected through FLUX VAE, measure L2 disruption.
        Test 2 — SD 1.5 Inpainting: run on BOTH original and protected (dual-run).
                  Uploads inpaint-on-original to R2 → r2_key_original for UI comparison.
        """
        print(f"[Simulation] verify_editing v3: {image_url}")
        import torch
        import numpy as np
        import cv2
        import torchvision.transforms as T
        from diffusers import AutoencoderKL, StableDiffusionInpaintPipeline
        from PIL import Image

        try:
            device = "cuda" if torch.cuda.is_available() else "cpu"
            dtype  = torch.float16 if device == "cuda" else torch.float32

            img_prot_pil = self._download_image(image_url)
            img_orig_pil = self._download_image(original_url) if original_url else None

            resize_512  = T.Resize((512, 512), interpolation=T.InterpolationMode.BICUBIC, antialias=True)
            to_tensor   = T.ToTensor()

            def laplacian_variance(pil_img):
                arr = np.array(pil_img.resize((512, 512)))
                gray = cv2.cvtColor(arr[192:320, 192:320], cv2.COLOR_RGB2GRAY)
                return float(cv2.Laplacian(gray, cv2.CV_64F).var())

            results = {}

            # === Test 1: FLUX VAE proxy (latent L2 disruption) ===
            flux_latent_disruption = None
            try:
                flux_vae = AutoencoderKL.from_pretrained(
                    "black-forest-labs/FLUX.1-schnell", subfolder="vae", torch_dtype=torch.float32
                ).to(device)
                flux_vae.eval()

                def vae_latent(pil_img):
                    t = resize_512(to_tensor(pil_img).unsqueeze(0).to(device)) * 2 - 1
                    with torch.no_grad():
                        return flux_vae.encode(t).latent_dist.mean

                z_prot = vae_latent(img_prot_pil)
                baseline_l2 = 0.0  # same image vs itself = 0
                if img_orig_pil:
                    z_orig = vae_latent(img_orig_pil)
                    disruption = torch.mean((z_prot - z_orig) ** 2).item()
                else:
                    disruption = torch.mean(z_prot ** 2).item()  # rough proxy

                flux_latent_disruption = disruption
                results["flux_vae_proxy"] = {
                    "model": "FLUX-VAE-16ch",
                    "baseline_latent_l2": baseline_l2,
                    "protected_latent_l2": disruption,
                    "disruption_score": disruption,
                }
                del flux_vae
                torch.cuda.empty_cache()
                print(f"[verify_editing] FLUX VAE disruption: {disruption:.4f}")
            except Exception as e:
                print(f"[verify_editing] FLUX VAE proxy error: {e}")

            # === Test 2: SD 1.5 Inpainting (dual-run) ===
            r2_key_original = None
            try:
                pipe = StableDiffusionInpaintPipeline.from_pretrained(
                    "runwayml/stable-diffusion-inpainting", torch_dtype=dtype, safety_checker=None
                ).to(device)

                # Build centre mask — SD Inpainting expects a grayscale "L" mask
                # (white=inpaint, black=keep). diffusers converts RGB internally but
                # grayscale is unambiguous and avoids edge-case mode confusion.
                mask_np = np.zeros((512, 512), dtype=np.uint8)
                mask_np[192:320, 192:320] = 255
                mask_img = Image.fromarray(mask_np, mode='L')
                prompt = "clean background, smooth texture, high quality"

                # Run on protected
                img_prot_512 = img_prot_pil.resize((512, 512))
                result_prot = pipe(
                    prompt=prompt, image=img_prot_512, mask_image=mask_img,
                    num_inference_steps=20, guidance_scale=7.5,
                ).images[0]
                var_prot = laplacian_variance(result_prot)

                # Run on original (baseline)
                var_orig = None
                if img_orig_pil:
                    img_orig_512 = img_orig_pil.resize((512, 512))
                    result_orig = pipe(
                        prompt=prompt, image=img_orig_512, mask_image=mask_img,
                        num_inference_steps=20, guidance_scale=7.5,
                    ).images[0]
                    var_orig = laplacian_variance(result_orig)

                    # Upload original inpaint result to R2 for side-by-side UI
                    if path_prefix:
                        key_orig = f"{path_prefix}/verification/layer_3_editing_original.png"
                        self._upload_to_r2(self._pil_to_bytes(result_orig), key_orig, is_preview=is_preview)
                        r2_key_original = key_orig

                results["legacy"] = {
                    "model": "SD1.5-inpainting",
                    "baseline_variance": var_orig,
                    "protected_variance": var_prot,
                    "disruption_ratio": (var_prot / var_orig) if var_orig and var_orig > 0 else None,
                }

                del pipe
                torch.cuda.empty_cache()

                is_disrupted = var_prot > 1200.0 or var_prot < 50.0
                protection_score = 0.95 if is_disrupted else 0.2
                status = "PASS" if is_disrupted else "FAIL"

                return {
                    **results,
                    "r2_key_original": r2_key_original,
                    "flux_latent_disruption": flux_latent_disruption,
                    # backward-compat flat keys
                    "artifacts_metric": var_prot,
                    "protection_score": protection_score,
                    "status": status,
                }
            except Exception as e:
                print(f"[verify_editing] SD inpainting error: {e}")
                # Fallback to FLUX proxy result only
                has_disruption = flux_latent_disruption is not None and flux_latent_disruption > 0.01
                return {
                    **results,
                    "r2_key_original": r2_key_original,
                    "flux_latent_disruption": flux_latent_disruption,
                    "protection_score": 0.8 if has_disruption else 0.1,
                    "status": "PASS" if has_disruption else "FAIL",
                    "error": str(e),
                }
        except Exception as e:
            print(f"[verify_editing] Error: {e}")
            return {"status": "ERROR", "error": str(e)}

    @modal.method()
    def verify_watermark(
        self, image_url: str, original_url: str = None, expected_text: str = None
    ) -> Dict[str, Any]:
        """v3 watermark verification — TrustMark decoder + multi-attack robustness.

        Baseline: decode from original (should find nothing — verifies no pre-existing mark).
        Protected: decode under 5 attack scenarios:
          direct, JPEG-80, JPEG-60, bilateral-filter, FLUX-VAE-encode-decode (honest).
        """
        print(f"[Simulation] verify_watermark v3: {image_url}")
        import cv2
        import numpy as np
        from PIL import Image
        from trustmark import TrustMark

        def wm_match(decoded, expected):
            if not decoded or not expected:
                return False
            d, e = decoded.strip(), expected.strip()
            return d == e or d in e or e in d

        def decode_with_trustmark(tm, pil_img):
            try:
                decoded, present, conf = tm.decode(pil_img)
                return str(decoded or ""), bool(present), float(conf or 0.0)
            except Exception as ex:
                print(f"TrustMark decode error: {ex}")
                return "", False, 0.0

        try:
            tm = TrustMark(verbose=False, model_type='C')

            img_prot = self._download_image(image_url)
            img_np   = np.array(img_prot)
            img_bgr  = cv2.cvtColor(img_np, cv2.COLOR_RGB2BGR)

            # --- Baseline: decode from original (should be empty) ---
            baseline = {"trustmark_detected": False, "decoded": ""}
            if original_url:
                try:
                    img_orig = self._download_image(original_url)
                    _, present_orig, _ = decode_with_trustmark(tm, img_orig)
                    baseline = {"trustmark_detected": bool(present_orig), "decoded": ""}
                except Exception as e:
                    print(f"[verify_watermark] Baseline load error: {e}")

            # --- Direct decode ---
            decoded_direct, present_direct, _ = decode_with_trustmark(tm, img_prot)
            match_direct = wm_match(decoded_direct, expected_text)

            # --- JPEG q80 ---
            _, enc80 = cv2.imencode('.jpg', img_bgr, [cv2.IMWRITE_JPEG_QUALITY, 80])
            img_j80 = Image.fromarray(cv2.cvtColor(cv2.imdecode(enc80, 1), cv2.COLOR_BGR2RGB))
            decoded_j80, present_j80, _ = decode_with_trustmark(tm, img_j80)
            match_j80 = wm_match(decoded_j80, expected_text)

            # --- JPEG q60 ---
            _, enc60 = cv2.imencode('.jpg', img_bgr, [cv2.IMWRITE_JPEG_QUALITY, 60])
            img_j60 = Image.fromarray(cv2.cvtColor(cv2.imdecode(enc60, 1), cv2.COLOR_BGR2RGB))
            decoded_j60, present_j60, _ = decode_with_trustmark(tm, img_j60)
            match_j60 = wm_match(decoded_j60, expected_text)

            # --- Bilateral filter (AdverseCleaner proxy) ---
            img_bil_bgr = cv2.bilateralFilter(img_bgr, d=15, sigmaColor=75, sigmaSpace=75)
            img_bil = Image.fromarray(cv2.cvtColor(img_bil_bgr, cv2.COLOR_BGR2RGB))
            decoded_bil, present_bil, _ = decode_with_trustmark(tm, img_bil)
            match_bil = wm_match(decoded_bil, expected_text)

            # --- FLUX VAE encode-decode (honest robustness test — likely fails) ---
            decoded_vae, present_vae, match_vae = "", False, False
            try:
                import torch
                import torchvision.transforms as T
                from diffusers import AutoencoderKL

                device = 'cuda' if torch.cuda.is_available() else 'cpu'
                fvae = AutoencoderKL.from_pretrained(
                    "black-forest-labs/FLUX.1-schnell", subfolder="vae", torch_dtype=torch.float32
                ).to(device)
                fvae.eval()

                t = T.ToTensor()(img_prot).unsqueeze(0).to(device)
                t_512 = T.Resize((512, 512))(t) * 2 - 1  # [0,1] → [-1,1]

                with torch.no_grad():
                    z = fvae.encode(t_512).latent_dist.sample()
                    rec = fvae.decode(z).sample

                rec_np = ((rec.squeeze(0).permute(1, 2, 0).cpu().numpy() + 1) * 127.5).clip(0, 255).astype(np.uint8)
                img_vae = Image.fromarray(rec_np).resize(img_prot.size)
                del fvae
                torch.cuda.empty_cache()

                decoded_vae, present_vae, _ = decode_with_trustmark(tm, img_vae)
                match_vae = wm_match(decoded_vae, expected_text)
            except Exception as e:
                print(f"[verify_watermark] FLUX VAE pass error: {e}")

            # Robustness score (fraction of attack scenarios where mark survives)
            tests = [match_direct, match_j80, match_j60, bool(match_vae), match_bil]
            robustness_score = sum(1 for t in tests if t) / len(tests)

            return {
                "baseline": baseline,
                "direct":    {"detected": bool(present_direct), "match": bool(match_direct)},
                "jpeg_80":   {"detected": bool(present_j80),    "match": bool(match_j80)},
                "jpeg_60":   {"detected": bool(present_j60),    "match": bool(match_j60)},
                "vae_pass":  {"detected": bool(present_vae),    "match": bool(match_vae)},
                "bilateral": {"detected": bool(present_bil),    "match": bool(match_bil)},
                "robustness_score": robustness_score,
                # backward-compat flat keys
                "watermark_detected": bool(present_direct),
                "decoded_uuid": decoded_direct,
                "protection_score": robustness_score,
                "status": "PASS" if match_direct else "FAIL",
            }
        except Exception as e:
            print(f"[verify_watermark] Error: {e}")
            return {"status": "ERROR", "error": str(e)}
