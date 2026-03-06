// ─── Credit Transaction Types ─────────────────────────────────────────────────
//
// Platform credit model:
//   - Credits are a prepaid, non-transferable, non-redeemable unit of account.
//   - They CANNOT be withdrawn or converted back to fiat under any circumstances.
//   - They represent entitlement to platform services only.
//
// Two participant types:
//   - Consumer: any user purchasing/spending credits for platform services
//   - Merchant: a user (artist) who receives earned credit from consumers
//     via the platform's escrow. Merchants can redeem credits against
//     platform fees (e.g. storage, feature unlocks) but NOT withdraw to fiat.
//
// Flow:
//   Consumer buys credits (Stripe) → credits_purchased
//   Consumer pays for internal service → credits_spent (service_charge)
//   Consumer pays artist via commission → credits_escrowed (held)
//   Milestone approved → credits_released (merchant receives)
//   Merchant spends on platform service → credits_spent (service_charge)
//   Cancellation → credits_refunded (back to consumer's balance)

export const CreditTxType = {
    // ── Inflows ──────────────────────────────────────────────────────────────
    PURCHASE: "purchase", // Stripe payment → credits granted
    BONUS: "bonus", // Platform bonus (welcome, promo, etc.)
    REFERRAL: "referral", // Referral reward
    REFUND: "refund", // Canceled service → credits returned
    ESCROW_RELEASE: "escrow_release", // Approved milestone → merchant credited

    // ── Outflows ─────────────────────────────────────────────────────────────
    SERVICE_CHARGE: "service_charge", // Internal platform service (storage, protection, etc.)
    ESCROW_HOLD: "escrow_hold", // Funds held pending milestone approval
    ESCROW_CANCEL: "escrow_cancel", // Escrow voided → consumer refunded

    // ── Administrative ───────────────────────────────────────────────────────
    ADJUSTMENT: "adjustment", // Manual correction by platform admin
    EXPIRY: "expiry", // Promotional credits expired (if applicable)
} as const;

export type CreditTxTypeValue =
    (typeof CreditTxType)[keyof typeof CreditTxType];

// ─── Credit Participant Role ──────────────────────────────────────────────────

export const CreditParticipantRole = {
    CONSUMER: "consumer", // Buying/spending credits for their own services
    MERCHANT: "merchant", // Receiving credits earned from consumer payments
    PLATFORM: "platform", // Internal platform account (fees, adjustments)
} as const;

export type CreditParticipantRoleValue =
    (typeof CreditParticipantRole)[keyof typeof CreditParticipantRole];

// ─── Service Types (what a SERVICE_CHARGE was for) ───────────────────────────

export const ServiceType = {
    ARTWORK_PROTECTION: "artwork_protection",
    STORAGE: "storage",
    FEATURE_UNLOCK: "feature_unlock",
    COMMISSION_FEE: "commission_fee", // Platform fee on commission transactions
    CUSTOM: "custom",
} as const;

export type ServiceTypeValue = (typeof ServiceType)[keyof typeof ServiceType];
