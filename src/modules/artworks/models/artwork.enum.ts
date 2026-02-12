export const ProtectionStatus = {
    IDLE: "idle", // Recién subido, sin procesar
    UPLOADING: "uploading",
    QUEUED: "queued",
    PROCESSING: "processing",
    DONE: "done",
    FAILED: "failed",
    CANCELED: "canceled",
} as const;

export type ProtectionStatusType =
    (typeof ProtectionStatus)[keyof typeof ProtectionStatus];

export const ProtectionMethod = {
    MIST: "mist", // Keep for backward compatibility
    WATERMARK: "watermark", 
    POISONING: "poisoning",
    // New methods
    POISON_IVY: "poison-ivy",
    CONCEPT_CLOAK: "concept-cloak",
    VISUAL_WATERMARK: "visual-watermark",
} as const;

export type ProtectionMethodType =
    (typeof ProtectionMethod)[keyof typeof ProtectionMethod];
