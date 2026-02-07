from pydantic import BaseModel
from typing import Optional, Dict, Any

class ProtectionRequest(BaseModel):
    image_url: str
    artwork_id: str
    user_id: str
    config: Dict[str, Any] = {}
    callback_url: Optional[str] = None
    webhook_secret: Optional[str] = None

class ProtectionResult(BaseModel):
    artwork_id: str
    status: str
    original_image_url: str
    protected_image_url: Optional[str] = None
    processing_time: float
    file_metadata: Dict[str, Any] = {} # sha256, size, width, height
    error_message: Optional[str] = None
