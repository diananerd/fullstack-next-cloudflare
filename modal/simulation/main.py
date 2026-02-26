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

    # HF login — required for gated models (e.g. FLUX VAE)
    hf_token = os.environ.get("HF_TOKEN") or os.environ.get("HUGGING_FACE_HUB_TOKEN")
    if hf_token:
        from huggingface_hub import login
        login(token=hf_token, add_to_git_credential=False)
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
        # /api/assets/ routes require Bearer auth (same token used for /protect)
        auth_token = os.environ.get("MODAL_AUTH_TOKEN", "")
        if auth_token and "/api/assets/" in url:
            headers["Authorization"] = f"Bearer {auth_token}"
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
            print(f"[R2] ↑ {bucket} / {key} ({len(image_bytes)/1024:.0f}KB)")
            return key
        except Exception as e:
            print(f"[R2] ✗ Upload failed → {bucket}/{key}: {e}")
            return None

    def _pil_to_bytes(self, img, fmt="PNG") -> bytes:
        buf = io.BytesIO()
        img.save(buf, format=fmt)
        return buf.getvalue()

    @modal.method()
    def verify_identity(self, image_url: str, original_url: str = None, path_prefix: str = None, is_preview: bool = False) -> Dict[str, Any]:
        """v3 dual-run identity verification.

        Runs antelopev2 (primary) and buffalo_l (legacy) on BOTH the original
        and protected images, returning baseline/protected/delta for each model.
        """
        import torch
        import cv2
        import numpy as np
        import insightface
        from PIL import Image, ImageDraw

        print(f"[SIM|verify_identity] ▶ v3 dual-run start")
        print(f"[SIM|verify_identity] ↓ Protected ← {'...'+image_url[-60:] if len(image_url)>80 else image_url}")
        if original_url:
            print(f"[SIM|verify_identity] ↓ Original  ← {'...'+original_url[-60:] if len(original_url)>80 else original_url}")

        def detect_faces(app_face, bgr_img):
            faces = app_face.get(bgr_img)
            n = len(faces)
            conf = float(faces[0].det_score) if n > 0 else 0.0
            return n, conf, faces

        try:
            providers = ['CUDAExecutionProvider'] if torch.cuda.is_available() else ['CPUExecutionProvider']

            img_prot_pil = self._download_image(image_url)
            print(f"[SIM|verify_identity] ↓ Protected loaded: {img_prot_pil.width}×{img_prot_pil.height}px")
            img_prot_bgr = cv2.cvtColor(np.array(img_prot_pil), cv2.COLOR_RGB2BGR)

            img_orig_bgr = None
            img_orig_pil = None
            if original_url:
                try:
                    img_orig_pil = self._download_image(original_url)
                    print(f"[SIM|verify_identity] ↓ Original loaded: {img_orig_pil.width}×{img_orig_pil.height}px")
                    img_orig_bgr = cv2.cvtColor(np.array(img_orig_pil), cv2.COLOR_RGB2BGR)
                except Exception as e:
                    print(f"[SIM|verify_identity] ⚠ Original load failed: {e}")

            results = {}
            faces_orig_primary = []
            faces_prot_primary = []

            # --- antelopev2 (primary — ArcFace R100 / InstantID / ReActor era) ---
            print(f"[SIM|verify_identity] ⚙ Loading antelopev2 (ArcFace R100) ...")
            try:
                app_v2 = insightface.app.FaceAnalysis(name='antelopev2', providers=providers)
                app_v2.prepare(ctx_id=0, det_size=(640, 640))

                n_orig_v2, conf_orig_v2, faces_orig_v2 = detect_faces(app_v2, img_orig_bgr) if img_orig_bgr is not None else (0, 0.0, [])
                n_prot_v2, conf_prot_v2, faces_prot_v2 = detect_faces(app_v2, img_prot_bgr)
                drop_v2 = conf_orig_v2 - conf_prot_v2
                print(f"[SIM|verify_identity|antelopev2] Original → {n_orig_v2} face(s) conf={conf_orig_v2:.3f}")
                print(f"[SIM|verify_identity|antelopev2] Protected → {n_prot_v2} face(s) conf={conf_prot_v2:.3f} | drop={drop_v2:.3f}")

                faces_orig_primary = faces_orig_v2
                faces_prot_primary = faces_prot_v2

                results["latest"] = {
                    "model": "antelopev2",
                    "baseline": {"faces_detected": n_orig_v2, "confidence": conf_orig_v2},
                    "protected": {"faces_detected": n_prot_v2, "confidence": conf_prot_v2},
                    "confidence_drop": drop_v2,
                }
                del app_v2
            except Exception as e:
                print(f"[SIM|verify_identity] ⚠ antelopev2 error: {e}")

            # --- buffalo_l (legacy) ---
            print(f"[SIM|verify_identity] ⚙ Loading buffalo_l (legacy) ...")
            try:
                app_bl = insightface.app.FaceAnalysis(name='buffalo_l', providers=providers)
                app_bl.prepare(ctx_id=0, det_size=(640, 640))

                n_orig_bl, conf_orig_bl, _ = detect_faces(app_bl, img_orig_bgr) if img_orig_bgr is not None else (0, 0.0, [])
                n_prot_bl, conf_prot_bl, _ = detect_faces(app_bl, img_prot_bgr)
                drop_bl = conf_orig_bl - conf_prot_bl
                print(f"[SIM|verify_identity|buffalo_l] Original → {n_orig_bl} face(s) conf={conf_orig_bl:.3f}")
                print(f"[SIM|verify_identity|buffalo_l] Protected → {n_prot_bl} face(s) conf={conf_prot_bl:.3f} | drop={drop_bl:.3f}")

                results["legacy"] = {
                    "model": "buffalo_l",
                    "baseline": {"faces_detected": n_orig_bl, "confidence": conf_orig_bl},
                    "protected": {"faces_detected": n_prot_bl, "confidence": conf_prot_bl},
                    "confidence_drop": drop_bl,
                }
                del app_bl
            except Exception as e:
                print(f"[SIM|verify_identity] ⚠ buffalo_l error: {e}")

            # Flatten backward-compat keys from primary (antelopev2) or fall back to legacy
            primary = results.get("latest") or results.get("legacy", {})
            prot_entry = primary.get("protected", {})
            faces_detected = prot_entry.get("faces_detected", 0)
            confidence     = prot_entry.get("confidence", 0.0)
            confidence_drop = primary.get("confidence_drop", 0.0)
            protection_score = max(0.0, 1.0 - confidence)

            pass_threshold = 0.60
            status = "PASS" if (faces_detected == 0 or confidence < pass_threshold) else "FAIL"

            ret = {
                **results,
                # backward-compat flat keys
                "faces_detected": int(faces_detected),
                "confidence": float(confidence),
                "confidence_drop": float(confidence_drop),
                "protection_score": float(protection_score),
                "status": status,
            }

            # --- Generate and upload visual artifacts ---
            if path_prefix:
                try:
                    # Original visualization
                    if img_orig_pil is not None:
                        vis_orig = Image.fromarray(cv2.cvtColor(img_orig_bgr, cv2.COLOR_BGR2RGB)).copy()
                        draw_orig = ImageDraw.Draw(vis_orig)
                        for face in faces_orig_primary:
                            bbox = face.bbox.astype(int)
                            conf_f = float(face.det_score)
                            draw_orig.rectangle([bbox[0], bbox[1], bbox[2], bbox[3]], outline=(255, 0, 0), width=3)
                            draw_orig.text((bbox[0], max(0, bbox[1] - 15)), f"{conf_f:.0%}", fill=(255, 0, 0))
                        # Top banner
                        w_o, h_o = vis_orig.size
                        banner_orig = Image.new("RGB", (w_o, 30), (30, 30, 30))
                        draw_b = ImageDraw.Draw(banner_orig)
                        draw_b.text((8, 8), "Original — Face Detection", fill=(220, 220, 220))
                        combined_orig = Image.new("RGB", (w_o, h_o + 30))
                        combined_orig.paste(banner_orig, (0, 0))
                        combined_orig.paste(vis_orig, (0, 30))
                        key_orig = f"{path_prefix}/verification/layer_1_identity_orig.png"
                        self._upload_to_r2(self._pil_to_bytes(combined_orig), key_orig, is_preview=is_preview)
                        ret["r2_key_original"] = key_orig
                        print(f"[SIM|verify_identity] ↑ Viz (original) → {key_orig}")

                    # Protected visualization
                    vis_prot = Image.fromarray(cv2.cvtColor(img_prot_bgr, cv2.COLOR_BGR2RGB)).copy()
                    draw_prot = ImageDraw.Draw(vis_prot)
                    for face in faces_prot_primary:
                        bbox = face.bbox.astype(int)
                        conf_f = float(face.det_score)
                        draw_prot.rectangle([bbox[0], bbox[1], bbox[2], bbox[3]], outline=(255, 165, 0), width=3)
                        draw_prot.text((bbox[0], max(0, bbox[1] - 15)), f"{conf_f:.0%}", fill=(255, 165, 0))
                    w_p, h_p = vis_prot.size
                    banner_prot = Image.new("RGB", (w_p, 30), (30, 30, 30))
                    draw_bp = ImageDraw.Draw(banner_prot)
                    draw_bp.text((8, 8), "Protected — Face Detection", fill=(220, 220, 220))
                    combined_prot = Image.new("RGB", (w_p, h_p + 30))
                    combined_prot.paste(banner_prot, (0, 0))
                    combined_prot.paste(vis_prot, (0, 30))
                    # Status overlay at bottom
                    draw_status = ImageDraw.Draw(combined_prot)
                    total_h = h_p + 30
                    n_prot_faces = len(faces_prot_primary)
                    if n_prot_faces == 0:
                        status_text = "✓ No face detected"
                        status_color = (0, 200, 0)
                    else:
                        status_text = f"⚠ {n_prot_faces} face(s) detected"
                        status_color = (255, 80, 80)
                    draw_status.rectangle([0, total_h - 30, w_p, total_h], fill=(25, 25, 35))
                    draw_status.text((8, total_h - 22), status_text, fill=status_color)
                    key_prot = f"{path_prefix}/verification/layer_1_identity_prot.png"
                    self._upload_to_r2(self._pil_to_bytes(combined_prot), key_prot, is_preview=is_preview)
                    ret["r2_key"] = key_prot
                    print(f"[SIM|verify_identity] ↑ Viz (protected) → {key_prot}")
                except Exception as e:
                    print(f"[SIM|verify_identity] ⚠ Visualization upload error: {e}")

            print(f"[SIM|verify_identity] ✓ Result — status={ret['status']} faces_prot={ret['faces_detected']} conf_prot={ret['confidence']:.3f} protection_score={ret['protection_score']:.3f}")
            return ret
        except Exception as e:
            print(f"[SIM|verify_identity] ✗ Fatal error: {e}")
            return {"status": "ERROR", "error": str(e)}

    @modal.method()
    def verify_style(self, image_url: str, original_url: str = None, path_prefix: str = None, is_preview: bool = False) -> Dict[str, Any]:
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
        from PIL import Image, ImageDraw

        print(f"[SIM|verify_style] ▶ v3 dual-run start")
        print(f"[SIM|verify_style] ↓ Protected ← {'...'+image_url[-60:] if len(image_url)>80 else image_url}")
        if original_url:
            print(f"[SIM|verify_style] ↓ Original  ← {'...'+original_url[-60:] if len(original_url)>80 else original_url}")

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
            print(f"[SIM|verify_style] ↓ Original loaded: {img_original.width}×{img_original.height}px")
            img_protected = self._download_image(image_url)
            print(f"[SIM|verify_style] ↓ Protected loaded: {img_protected.width}×{img_protected.height}px")

            t_orig = T.ToTensor()(img_original).unsqueeze(0).to(device)
            t_prot = T.ToTensor()(img_protected).unsqueeze(0).to(device)
            if t_orig.shape != t_prot.shape:
                t_prot = T.Resize(t_orig.shape[2:])(t_prot)

            results = {}

            # --- OpenCLIP ViT-H/14 (primary) ---
            print("[SIM|verify_style] ⚙ Loading OpenCLIP ViT-H/14 (primary) ...")
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
                print(f"[SIM|verify_style|openclip-H14] sim={sim_h:.4f} drift={1.0-sim_h:.4f}")
                results["latest"] = {
                    "model": "openclip-vit-h14",
                    "baseline_self_similarity": 1.0,
                    "protected_similarity": sim_h,
                    "drift": 1.0 - sim_h,
                }
                del clip_h
                torch.cuda.empty_cache()
            except Exception as e:
                print(f"[SIM|verify_style] ⚠ OpenCLIP ViT-H/14 error: {e}")

            # --- CLIP ViT-L/14 (legacy) ---
            print("[SIM|verify_style] ⚙ Loading CLIP ViT-L/14 (legacy) ...")
            try:
                from transformers import CLIPModel, CLIPProcessor
                clip_l = CLIPModel.from_pretrained("openai/clip-vit-large-patch14").to(device)
                proc_l = CLIPProcessor.from_pretrained("openai/clip-vit-large-patch14")
                inputs = proc_l(images=[img_original, img_protected], return_tensors="pt", padding=True).to(device)
                with torch.no_grad():
                    feats = clip_l.get_image_features(**inputs)
                sim_l = cos(feats[0].unsqueeze(0), feats[1].unsqueeze(0)).item()
                print(f"[SIM|verify_style|clip-L14] sim={sim_l:.4f} drift={1.0-sim_l:.4f}")
                results["legacy"] = {
                    "model": "clip-vit-l14",
                    "protected_similarity": sim_l,
                    "drift": 1.0 - sim_l,
                }
                del clip_l
                torch.cuda.empty_cache()
            except Exception as e:
                print(f"[SIM|verify_style] ⚠ CLIP ViT-L/14 error: {e}")

            # --- FLUX VAE latent drift (proxy for LoRA style disruption) ---
            print("[SIM|verify_style] ⚙ Loading FLUX VAE (16-ch) for latent drift ...")
            flux_vae_latent_drift = None
            rec_orig_pil = None
            rec_prot_pil = None
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
                print(f"[SIM|verify_style|FLUX-VAE] latent_drift={flux_vae_latent_drift:.4f}")
                # Decode both latents to get reconstruction images for visualization
                with torch.no_grad():
                    rec_orig = flux_vae.decode(z_orig).sample
                    rec_prot = flux_vae.decode(z_prot).sample
                rec_orig_np = ((rec_orig.squeeze(0).permute(1, 2, 0).cpu().numpy() + 1) * 127.5).clip(0, 255).astype(np.uint8)
                rec_prot_np = ((rec_prot.squeeze(0).permute(1, 2, 0).cpu().numpy() + 1) * 127.5).clip(0, 255).astype(np.uint8)
                rec_orig_pil = Image.fromarray(rec_orig_np)
                rec_prot_pil = Image.fromarray(rec_prot_np)
                del flux_vae
                torch.cuda.empty_cache()
            except Exception as e:
                print(f"[SIM|verify_style] ⚠ FLUX VAE latent drift error: {e}")

            # --- PSNR ---
            mse = torch.mean((t_orig.cpu() - t_prot.cpu()) ** 2).item()
            psnr = 20 * math.log10(1.0 / math.sqrt(mse)) if mse > 0 else 100.0

            # Use primary model (ViT-H/14) or fall back to legacy for flat keys
            primary = results.get("latest") or results.get("legacy", {})
            style_similarity = primary.get("protected_similarity", 1.0)
            feature_drift = max(0.0, 0.995 - style_similarity)
            score = min(1.0, feature_drift * 20)
            status = "PASS" if style_similarity < 0.994 else "FAIL"

            ret = {
                **results,
                # backward-compat flat keys
                "style_similarity": style_similarity,
                "flux_vae_latent_drift": flux_vae_latent_drift,
                "visual_quality_psnr": psnr,
                "protection_score": score,
                "status": status,
            }

            # --- Generate and upload VAE reconstruction visualizations ---
            if path_prefix:
                try:
                    def _add_banner(pil_img, text):
                        w, h = pil_img.size
                        banner = Image.new("RGB", (w, 30), (30, 30, 30))
                        draw_b = ImageDraw.Draw(banner)
                        draw_b.text((8, 8), text, fill=(220, 220, 220))
                        combined = Image.new("RGB", (w, h + 30))
                        combined.paste(banner, (0, 0))
                        combined.paste(pil_img, (0, 30))
                        return combined

                    if rec_orig_pil is not None:
                        vis_orig = _add_banner(rec_orig_pil, "Original — VAE Reconstruction")
                        key_orig = f"{path_prefix}/verification/layer_2_mimicry_orig.png"
                        self._upload_to_r2(self._pil_to_bytes(vis_orig), key_orig, is_preview=is_preview)
                        ret["r2_key_original"] = key_orig
                        print(f"[SIM|verify_style] ↑ VAE recon (original) → {key_orig}")

                    if rec_prot_pil is not None:
                        vis_prot = _add_banner(rec_prot_pil, "Protected — VAE Reconstruction (disrupted latent)")
                        key_prot = f"{path_prefix}/verification/layer_2_mimicry_prot.png"
                        self._upload_to_r2(self._pil_to_bytes(vis_prot), key_prot, is_preview=is_preview)
                        ret["r2_key"] = key_prot
                        print(f"[SIM|verify_style] ↑ VAE recon (protected) → {key_prot}")
                except Exception as e:
                    print(f"[SIM|verify_style] ⚠ Visualization upload error: {e}")

            print(f"[SIM|verify_style] ✓ Result — status={ret['status']} style_sim={ret['style_similarity']:.4f} flux_drift={ret.get('flux_vae_latent_drift',0):.4f} psnr={ret['visual_quality_psnr']:.1f}dB protection_score={ret['protection_score']:.3f}")
            return ret
        except Exception as e:
            print(f"[SIM|verify_style] ✗ Fatal error: {e}")
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
        print(f"[SIM|verify_editing] ▶ v3 dual-run start")
        print(f"[SIM|verify_editing] ↓ Protected ← {'...'+image_url[-60:] if len(image_url)>80 else image_url}")
        if original_url:
            print(f"[SIM|verify_editing] ↓ Original  ← {'...'+original_url[-60:] if len(original_url)>80 else original_url}")
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
            print(f"[SIM|verify_editing] ↓ Protected loaded: {img_prot_pil.width}×{img_prot_pil.height}px")
            img_orig_pil = self._download_image(original_url) if original_url else None
            if img_orig_pil:
                print(f"[SIM|verify_editing] ↓ Original loaded: {img_orig_pil.width}×{img_orig_pil.height}px")

            resize_512  = T.Resize((512, 512), interpolation=T.InterpolationMode.BICUBIC, antialias=True)
            to_tensor   = T.ToTensor()

            def laplacian_variance(pil_img):
                arr = np.array(pil_img.resize((512, 512)))
                gray = cv2.cvtColor(arr[192:320, 192:320], cv2.COLOR_RGB2GRAY)
                return float(cv2.Laplacian(gray, cv2.CV_64F).var())

            results = {}

            # === Test 1: FLUX VAE proxy (latent L2 disruption) ===
            print("[SIM|verify_editing] ⚙ Test 1 — Loading FLUX VAE (16-ch) for latent disruption ...")
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
                print(f"[SIM|verify_editing|FLUX-VAE] ✓ Latent disruption L2={disruption:.4f}")
            except Exception as e:
                print(f"[SIM|verify_editing] ⚠ FLUX VAE proxy error: {e}")

            # === Test 2: SD 1.5 Inpainting (dual-run) ===
            print("[SIM|verify_editing] ⚙ Test 2 — Loading SD 1.5 Inpainting for dual-run inpaint test ...")
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
                print(f"[SIM|verify_editing|SD1.5] Protected inpaint Laplacian variance={var_prot:.1f}")

                # Run on original (baseline)
                var_orig = None
                if img_orig_pil:
                    img_orig_512 = img_orig_pil.resize((512, 512))
                    result_orig = pipe(
                        prompt=prompt, image=img_orig_512, mask_image=mask_img,
                        num_inference_steps=20, guidance_scale=7.5,
                    ).images[0]
                    var_orig = laplacian_variance(result_orig)
                    print(f"[SIM|verify_editing|SD1.5] Original inpaint Laplacian variance={var_orig:.1f}")

                    # Upload original inpaint result to R2 for side-by-side UI
                    if path_prefix:
                        key_orig = f"{path_prefix}/verification/layer_3_editing_original.png"
                        self._upload_to_r2(self._pil_to_bytes(result_orig), key_orig, is_preview=is_preview)
                        r2_key_original = key_orig
                        print(f"[SIM|verify_editing] ↑ Inpaint (original) → {key_orig}")

                results["legacy"] = {
                    "model": "SD1.5-inpainting",
                    "baseline_variance": var_orig,
                    "protected_variance": var_prot,
                    "disruption_ratio": (var_prot / var_orig) if var_orig and var_orig > 0 else None,
                }

                del pipe
                torch.cuda.empty_cache()

                # PASS if any of:
                # 1. Absolute artifact threshold (very garbled or very clean output)
                # 2. SD inpaint disruption ratio vs baseline (>2.5× is clear disruption)
                # 3. FLUX VAE latent disruption proxy (>0.01)
                flux_disrupted = flux_latent_disruption is not None and flux_latent_disruption > 0.01
                ratio_disrupted = var_orig is not None and var_orig > 0 and (var_prot / var_orig) > 2.5
                is_disrupted = var_prot > 1200.0 or var_prot < 50.0 or flux_disrupted or ratio_disrupted
                protection_score = 0.95 if is_disrupted else 0.2
                status = "PASS" if is_disrupted else "FAIL"

                ratio_str = f"{var_prot/var_orig:.1f}x" if var_orig and var_orig > 0 else "N/A"
                print(f"[SIM|verify_editing] ⚡ Pass check — abs={var_prot>1200 or var_prot<50} ratio={ratio_disrupted}({ratio_str}) flux={flux_disrupted} → {status}")
                print(f"[SIM|verify_editing] ✓ Result — status={status} artifacts_metric={var_prot:.0f} flux_disruption={flux_latent_disruption:.4f if flux_latent_disruption else 'N/A'} protection_score={protection_score:.2f}")
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
                print(f"[SIM|verify_editing] ⚠ SD inpainting error: {e}")
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
            print(f"[SIM|verify_editing] ✗ Fatal error: {e}")
            return {"status": "ERROR", "error": str(e)}

    @modal.method()
    def verify_watermark(
        self, image_url: str, original_url: str = None, expected_text: str = None, path_prefix: str = None, is_preview: bool = False
    ) -> Dict[str, Any]:
        """v3 watermark verification — TrustMark decoder + multi-attack robustness.

        Baseline: decode from original (should find nothing — verifies no pre-existing mark).
        Protected: decode under 5 attack scenarios:
          direct, JPEG-80, JPEG-60, bilateral-filter, FLUX-VAE-encode-decode (honest).
        """
        print(f"[SIM|verify_watermark] ▶ v3 TrustMark-C multi-attack start — expected='{expected_text}'")
        print(f"[SIM|verify_watermark] ↓ Protected ← {'...'+image_url[-60:] if len(image_url)>80 else image_url}")
        if original_url:
            print(f"[SIM|verify_watermark] ↓ Original  ← {'...'+original_url[-60:] if len(original_url)>80 else original_url}")
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
                print(f"[SIM|verify_watermark] ⚠ TrustMark decode error: {ex}")
                return "", False, 0.0

        try:
            tm = TrustMark(verbose=False, model_type='C')

            img_prot = self._download_image(image_url)
            img_np   = np.array(img_prot)
            img_bgr  = cv2.cvtColor(img_np, cv2.COLOR_RGB2BGR)

            # --- Baseline: decode from original (should be empty) ---
            baseline = {"trustmark_detected": False, "decoded": ""}
            img_orig = None
            if original_url:
                try:
                    img_orig = self._download_image(original_url)
                    _, present_orig, _ = decode_with_trustmark(tm, img_orig)
                    baseline = {"trustmark_detected": bool(present_orig), "decoded": ""}
                except Exception as e:
                    print(f"[SIM|verify_watermark] ⚠ Baseline load error: {e}")

            # --- Direct decode ---
            decoded_direct, present_direct, _ = decode_with_trustmark(tm, img_prot)
            match_direct = wm_match(decoded_direct, expected_text)
            print(f"[SIM|verify_watermark|direct] detected={present_direct} match={match_direct} decoded='{decoded_direct[:20]}'")

            # --- JPEG q80 ---
            _, enc80 = cv2.imencode('.jpg', img_bgr, [cv2.IMWRITE_JPEG_QUALITY, 80])
            img_j80 = Image.fromarray(cv2.cvtColor(cv2.imdecode(enc80, 1), cv2.COLOR_BGR2RGB))
            decoded_j80, present_j80, _ = decode_with_trustmark(tm, img_j80)
            match_j80 = wm_match(decoded_j80, expected_text)
            print(f"[SIM|verify_watermark|JPEG-80] detected={present_j80} match={match_j80}")

            # --- JPEG q60 ---
            _, enc60 = cv2.imencode('.jpg', img_bgr, [cv2.IMWRITE_JPEG_QUALITY, 60])
            img_j60 = Image.fromarray(cv2.cvtColor(cv2.imdecode(enc60, 1), cv2.COLOR_BGR2RGB))
            decoded_j60, present_j60, _ = decode_with_trustmark(tm, img_j60)
            match_j60 = wm_match(decoded_j60, expected_text)
            print(f"[SIM|verify_watermark|JPEG-60] detected={present_j60} match={match_j60}")

            # --- Bilateral filter (AdverseCleaner proxy) ---
            img_bil_bgr = cv2.bilateralFilter(img_bgr, d=15, sigmaColor=75, sigmaSpace=75)
            img_bil = Image.fromarray(cv2.cvtColor(img_bil_bgr, cv2.COLOR_BGR2RGB))
            decoded_bil, present_bil, _ = decode_with_trustmark(tm, img_bil)
            match_bil = wm_match(decoded_bil, expected_text)
            print(f"[SIM|verify_watermark|bilateral] detected={present_bil} match={match_bil}")

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
                print(f"[SIM|verify_watermark|FLUX-VAE] detected={present_vae} match={match_vae}")
            except Exception as e:
                print(f"[SIM|verify_watermark] ⚠ FLUX VAE pass error: {e}")

            # Robustness score: fraction of scenarios where TrustMark detects the mark.
            # Uses TrustMark's own `present` confidence signal (not exact string match),
            # because TrustMark decode has minor char-level precision loss that can break
            # exact string comparison while the watermark is genuinely present.
            # String `match` is kept in the per-attack data for UI display but is informational only.
            detection_tests = [bool(present_direct), bool(present_j80), bool(present_j60), bool(present_vae), bool(present_bil)]
            robustness_score = sum(1 for t in detection_tests if t) / len(detection_tests)
            print(f"[SIM|verify_watermark] ⚡ Robustness score: {robustness_score:.0%} ({sum(detection_tests)}/{len(detection_tests)} attacks detected)")

            ret = {
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
                # PASS = TrustMark detects the mark (present). String match is informational.
                "status": "PASS" if present_direct else "FAIL",
            }

            # --- Generate and upload overlay visualizations ---
            if path_prefix:
                try:
                    from PIL import ImageDraw as _ImageDraw

                    def _add_bottom_banner(pil_img, text, text_color):
                        w, h = pil_img.size
                        vis = pil_img.copy()
                        draw = _ImageDraw.Draw(vis)
                        draw.rectangle([0, h - 45, w, h], fill=(25, 25, 35))
                        draw.text((8, h - 40), text, fill=text_color)
                        return vis

                    # Original: grey banner — no watermark expected
                    img_orig_vis = img_orig if img_orig is not None else img_prot
                    vis_orig = _add_bottom_banner(
                        img_orig_vis,
                        "Original — No watermark (expected)",
                        (160, 160, 160)
                    )
                    key_orig = f"{path_prefix}/verification/layer_4_watermark_orig.png"
                    self._upload_to_r2(self._pil_to_bytes(vis_orig), key_orig, is_preview=is_preview)
                    ret["r2_key_original"] = key_orig
                    print(f"[SIM|verify_watermark] ↑ Viz (original) → {key_orig}")

                    # Protected: green if TrustMark detected the mark, red if not
                    if present_direct:
                        prot_text = f"✓ Watermark verified: {decoded_direct[:25]}"
                        prot_color = (0, 200, 0)
                    else:
                        prot_text = "✗ Watermark not detected"
                        prot_color = (255, 80, 80)
                    vis_prot = _add_bottom_banner(img_prot, prot_text, prot_color)
                    key_prot = f"{path_prefix}/verification/layer_4_watermark_prot.png"
                    self._upload_to_r2(self._pil_to_bytes(vis_prot), key_prot, is_preview=is_preview)
                    ret["r2_key"] = key_prot
                    print(f"[SIM|verify_watermark] ↑ Viz (protected) → {key_prot}")
                except Exception as e:
                    print(f"[SIM|verify_watermark] ⚠ Visualization upload error: {e}")

            print(f"[SIM|verify_watermark] ✓ Result — status={ret['status']} detected={ret['watermark_detected']} decoded='{ret['decoded_uuid'][:20]}' robustness={ret['robustness_score']:.0%}")
            return ret
        except Exception as e:
            print(f"[SIM|verify_watermark] ✗ Fatal error: {e}")
            return {"status": "ERROR", "error": str(e)}
