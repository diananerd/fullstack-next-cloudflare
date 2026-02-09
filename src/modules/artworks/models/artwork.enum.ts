export const ProtectionStatus = {
    UPLOADING: "uploading",
    QUEUED: "queued",
    RUNNING: "running",
    PENDING: "pending",
    PROCESSING: "processing",
    PROTECTED: "protected",
    FAILED: "failed",
    CANCELED: "canceled",
} as const;

export type ProtectionStatusType =
    (typeof ProtectionStatus)[keyof typeof ProtectionStatus];

export const ProtectionMethod = {
    MIST: "mist",
    WATERMARK: "watermark", // Placeholder for future expansion
} as const;

export type ProtectionMethodType =
    (typeof ProtectionMethod)[keyof typeof ProtectionMethod];
