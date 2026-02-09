export const ProtectionStatus = {
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
    MIST: "mist",
    GRAYSCALE: "grayscale",
    WATERMARK: "watermark", // Placeholder for future expansion
} as const;

export type ProtectionMethodType =
    (typeof ProtectionMethod)[keyof typeof ProtectionMethod];
