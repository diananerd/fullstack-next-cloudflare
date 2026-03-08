/**
 * Typed clause registry — single source of truth for all legal clause types.
 * New clause types: add here only. No schema migration required.
 *
 * Each clause type maps to:
 *   1. A renderer  — produces human-readable legal text for the contract document
 *   2. An executor — platform business logic triggered by platform events
 *
 * The `value` field on `legal_clauses` is a JSON object whose shape is
 * type-specific. TypeScript clause value types should be defined alongside
 * the clause executor for each type.
 */
export const CLAUSE_TYPES = {
    // ── Attribution & moral rights ────────────────────────────────────────────
    /** Required credit text, format, and placement for all uses of the work. */
    ATTRIBUTION: "attribution",
    /** Waiver of moral rights (right of integrity / right of paternity) where
     *  legally permissible. Governed by `governing_law` clause. */
    MORAL_RIGHTS_WAIVER: "moral_rights_waiver",
    /** Work published under a pseudonym; real name legally protected. */
    PSEUDONYM: "pseudonym",

    // ── Economic rights scope ─────────────────────────────────────────────────
    /** Which economic rights are granted.
     *  value.rights: Array<'reproduce'|'distribute'|'display'|'perform'|
     *    'adapt'|'sublicense'|'make_available'|'broadcast'|'synchronize'> */
    RIGHTS_GRANT: "rights_grant",
    /** value.exclusivity: 'exclusive' | 'non_exclusive' | 'sole'
     *  Sole = exclusive but licensor retains right to use. */
    EXCLUSIVITY: "exclusivity",
    /** value.worldwide: boolean; value.include: string[]; value.exclude: string[]
     *  ISO 3166-1 alpha-2 country codes. */
    TERRITORY: "territory",
    /** value.perpetual: boolean; value.valid_until: ISO 8601 | null;
     *  value.years: number | null; value.auto_renew: boolean */
    DURATION: "duration",
    /** value.fields: Array<'commercial'|'non_commercial'|'editorial'|
     *    'advertising'|'personal'|'ai_training'|'merchandise'|'all'> */
    FIELD_OF_USE: "field_of_use",

    // ── Financial terms ───────────────────────────────────────────────────────
    /** value.type: 'flat_fee'|'revenue_pct'|'per_use'|'tiered'|'subscription'
     *  value.amount_cents: number (for flat_fee/per_use)
     *  value.pct: number 0-100 (for revenue_pct)
     *  value.tiers: Array<{from_cents, to_cents, pct}> (for tiered)
     *  value.currency: ISO 4217
     *  value.schedule: 'on_sale'|'monthly'|'quarterly'|'annually'
     *  value.payment_terms_days: number */
    ROYALTY: "royalty",
    /** Upfront payment against future royalties.
     *  value.amount_cents: number; value.currency: ISO 4217 */
    ADVANCE: "advance",
    /** Floor payment regardless of actual sales/usage.
     *  value.amount_cents: number; value.currency: ISO 4217; value.period: 'annual'|'lifetime' */
    MINIMUM_GUARANTEE: "minimum_guarantee",
    /** Licensee must allow rights-holder to audit royalty calculations.
     *  value.notice_days: number; value.frequency: 'annual'|'on_request' */
    AUDIT_RIGHTS: "audit_rights",
    /** Rights revert if earnings fall below threshold over a period.
     *  value.threshold_cents: number; value.period_months: number */
    REVERSION: "reversion",

    // ── Platform-specific execution clauses ───────────────────────────────────
    /** Links to node_credit_splits. Accepting this clause locks the split
     *  percentages immutably.
     *  value.splits: Array<{beneficiary_profile_id, pct}> — must sum to 100 */
    CREDIT_SPLIT: "credit_split",
    /** Platform holds funds in escrow until release condition is met.
     *  value.amount_cents: number; value.currency: ISO 4217
     *  value.release_condition: 'milestone_approved'|'both_parties'|'date'|'arbitration'
     *  value.release_date: ISO 8601 | null */
    ESCROW: "escrow",
    /** Payment tied to a commission milestone.
     *  value.milestone_title: string; value.amount_cents: number; value.currency: ISO 4217 */
    MILESTONE_PAYMENT: "milestone_payment",

    // ── Transfer & sublicensing ───────────────────────────────────────────────
    /** value.allowed: boolean; value.conditions: string | null;
     *  value.requires_approval: boolean */
    SUBLICENSE: "sublicense",
    /** Rights can be assigned/transferred to third parties.
     *  value.allowed: boolean; value.requires_approval: boolean */
    TRANSFER: "transfer",
    /** Party gets first option before offering to third parties.
     *  value.notice_days: number; value.match_period_days: number */
    RIGHT_OF_FIRST_REFUSAL: "right_of_first_refusal",

    // ── Termination ───────────────────────────────────────────────────────────
    /** value.breach_conditions: string[]; value.cure_period_days: number */
    TERMINATION_FOR_CAUSE: "termination_for_cause",
    /** Either party may exit with notice.
     *  value.notice_days: number */
    TERMINATION_CONVENIENCE: "termination_convenience",
    /** What happens if a party is acquired.
     *  value.automatic_termination: boolean; value.consent_required: boolean */
    CHANGE_OF_CONTROL: "change_of_control",
    /** Automatic termination on insolvency filing.
     *  value.automatic: boolean */
    BANKRUPTCY: "bankruptcy",

    // ── Dispute resolution ────────────────────────────────────────────────────
    /** value.country: ISO 3166-1 alpha-2; value.statute: string | null */
    GOVERNING_LAW: "governing_law",
    /** value.mechanism: 'arbitration'|'mediation'|'court'
     *  value.body: string (e.g. 'ICC', 'UNCITRAL', 'AAA')
     *  value.language: ISO 639-1; value.seat: city, country */
    DISPUTE_RESOLUTION: "dispute_resolution",
    /** value.cap_type: 'contract_value'|'fixed'|'none'
     *  value.cap_amount_cents: number | null
     *  value.excludes: Array<'gross_negligence'|'fraud'|'ip_infringement'> */
    LIMITATION_OF_LIABILITY: "limitation_of_liability",

    // ── Custom / open ─────────────────────────────────────────────────────────
    /** Free-form legal text drafted by one of the parties.
     *  value.text: string; value.heading: string */
    CUSTOM: "custom",
    /** Placeholder for a clause whose terms are not yet determined.
     *  Blocks contract activation until all open fields are resolved.
     *  value.description: string; value.pending_fields: string[] */
    OPEN_CLAUSE: "open_clause",
} as const;

export type ClauseType = (typeof CLAUSE_TYPES)[keyof typeof CLAUSE_TYPES];
