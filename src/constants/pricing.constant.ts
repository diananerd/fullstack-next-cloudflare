
import { ProtectionMethod, type ProtectionMethodType } from "@/modules/artworks/models/artwork.enum";

// Use constants for clearer price management
const PRICE_POISON = 0.5;
const PRICE_AI_WATERMARK = 0.25;
const PRICE_VISUAL_WATERMARK = 0;
const PRICE_VERIFICATION = 0.10;

export const PROTECTION_PRICING: Record<
    ProtectionMethodType | string,
    { cost: number; estimatedDuration: number; label: string }
> = {
    [ProtectionMethod.SHIELD]: {
        cost: 1.0,
        estimatedDuration: 90,
        label: "Drimit Shield V2",
    },
    // Verification step (part of Shield, but also standalone in older flows)
    "verification": {
        cost: 0.0, // Free
        estimatedDuration: 15,
        label: "Moondream Verification",
    },
};

export const DEFAULT_PROCESS_COST = 0.5;

