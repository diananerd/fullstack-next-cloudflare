export const CommissionStatus = {
    DRAFT: "draft",
    OPEN: "open",
    NEGOTIATING: "negotiating",
    ACCEPTED: "accepted",
    IN_PROGRESS: "in_progress",
    REVIEW: "review",
    COMPLETED: "completed",
    CANCELED: "canceled",
    DISPUTED: "disputed",
} as const;

export type CommissionStatusValue =
    (typeof CommissionStatus)[keyof typeof CommissionStatus];

export const MilestoneStatus = {
    PENDING: "pending",
    SUBMITTED: "submitted",
    APPROVED: "approved",
    RELEASED: "released",
    DISPUTED: "disputed",
} as const;

export type MilestoneStatusValue =
    (typeof MilestoneStatus)[keyof typeof MilestoneStatus];

export const PaymentStatus = {
    PENDING: "pending",
    HELD: "held",
    RELEASED: "released",
    REFUNDED: "refunded",
    DISPUTED: "disputed",
} as const;

export type PaymentStatusValue =
    (typeof PaymentStatus)[keyof typeof PaymentStatus];
