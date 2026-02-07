export const ProtectionStatus = {
    PENDING: "pending",
    PROCESSING: "processing",
    PROTECTED: "protected",
    FAILED: "failed",
    CANCELED: "canceled",
} as const;

export type ProtectionStatusType =
    (typeof ProtectionStatus)[keyof typeof ProtectionStatus];
