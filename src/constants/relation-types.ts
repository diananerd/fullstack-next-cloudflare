/**
 * Typed semantic edge registry — single source of truth for all relation types.
 * New relation types: add here only. No schema migration required.
 *
 * Notation: subject --[type]--> object
 */
export const RELATION_TYPES = {
    // ── Identity & membership ────────────────────────────────────────────────
    /** profile → profile  (member of a collective/studio, with role in metadata) */
    MEMBER_OF: "member_of",

    // ── Creation & attribution ───────────────────────────────────────────────
    /** profile → artwork  (primary author / creator) */
    CREATES: "creates",
    /** profile → artwork  (co-creator / contributor) */
    COLLABORATES: "collaborates",
    /** profile → artwork  (funded or requested this work) */
    COMMISSIONED: "commissioned",
    /** profile → artwork  (person depicted/represented in the work) */
    SUBJECTS: "subjects",
    /** profile → collection  (curator of this collection) */
    CURATES: "curates",
    /** profile → artwork | collection  (featured in portfolio / pinned) */
    FEATURES: "features",

    // ── Social ───────────────────────────────────────────────────────────────
    /** profile → profile  (follow relationship) */
    FOLLOWS: "follows",
    /** profile → artwork | profile  (public endorsement) */
    ENDORSES: "endorses",
    /** profile → profile  (private, never exposed publicly) */
    BLOCKS: "blocks",

    // ── Commerce ─────────────────────────────────────────────────────────────
    /** profile → artwork  (license grant; terms / scope / territory in metadata) */
    LICENSES: "licenses",
    /** profile → artwork | product  (purchase; transaction ref in metadata) */
    PURCHASES: "purchases",
    /** profile → product | service  (seller listing) */
    SELLS: "sells",
    /** profile → artwork  (distribution rights grant) */
    DISTRIBUTES: "distributes",

    // ── Structural (containment / hierarchy) ─────────────────────────────────
    /** collection → artwork | collection  (membership / sub-collection) */
    CONTAINS: "contains",

    // ── Provenance ───────────────────────────────────────────────────────────
    /** artwork → artwork  (protected version → original) */
    VERSION_OF: "version_of",
    /** artwork → artwork  (fan-art → original, prompt → response) */
    DERIVED_FROM: "derived_from",
    /** artwork → artwork | collection  (episode → series, page → book) */
    PART_OF: "part_of",

    // ── Semantic ─────────────────────────────────────────────────────────────
    /** artwork → artwork | node  (illustration → poem, cover → song) */
    REFERENCES: "references",
    /** artwork → artwork  (reply artwork → source artwork) */
    RESPONSE_TO: "response_to",

    // ── Discovery ────────────────────────────────────────────────────────────
    /** any → tag node  (categorization) */
    TAGGED_WITH: "tagged_with",
    /** artwork → artwork  (ML similarity score in metadata) */
    SIMILAR_TO: "similar_to",
} as const;

export type RelationType = (typeof RELATION_TYPES)[keyof typeof RELATION_TYPES];
