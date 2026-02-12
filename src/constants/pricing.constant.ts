
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
    // Legacy / Group keys
    [ProtectionMethod.POISONING]: {
        cost: 0.0,
        estimatedDuration: 60,
        label: "Protection Job",
    },
    // Specific UI keys
    "poison-ivy": {
        cost: PRICE_POISON, // 0.50
        estimatedDuration: 30,
        label: "Drimit Pixel Cloak",
    },
    "concept-cloak": {
        cost: 0.0,
        estimatedDuration: 30,
        label: "Drimit Concept Cloak", 
    },
    "ai-watermark": {
        cost: PRICE_AI_WATERMARK, // 0.25
        estimatedDuration: 10,
        label: "AI Watermark",
    },
    "visual-watermark": {
        cost: PRICE_VISUAL_WATERMARK, // 0.00
        estimatedDuration: 5,
        label: "Visual Watermark",
    },
    "verification": {
        cost: 0.0, // Free
        estimatedDuration: 15,
        label: "Moondream Verification",
    }
};

export const DEFAULT_PROCESS_COST = 0.5;

