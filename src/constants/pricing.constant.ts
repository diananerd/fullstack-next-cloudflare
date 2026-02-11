
import { ProtectionMethod, type ProtectionMethodType } from "@/modules/artworks/models/artwork.enum";

export const PROTECTION_PRICING: Record<
    ProtectionMethodType | string,
    { cost: number; estimatedDuration: number; label: string }
> = {
    [ProtectionMethod.MIST]: {
        cost: 1.5,
        estimatedDuration: 45, // seconds
        label: "AI Poisoning (Mist)",
    },
    [ProtectionMethod.GRAYSCALE]: {
        cost: 0.2, // Cheaper
        estimatedDuration: 5,
        label: "B&W Conversion",
    },
    [ProtectionMethod.WATERMARK]: {
        cost: 0.5,
        estimatedDuration: 10,
        label: "Visible Watermark",
    },
    "ai-watermark": {
        cost: 1.0,
        estimatedDuration: 30,
        label: "AI Watermark",
    },
};

export const DEFAULT_PROCESS_COST = 1.0;
