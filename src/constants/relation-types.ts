/**
 * Typed semantic edge registry — the single source of truth for all relation types.
 * New relation types: add here only. No schema migration required.
 */
export const RELATION_TYPES = {
    // Structural
    CONTAINS: "contains", // collection → artwork | collection → sub-collection
    // Provenance
    VERSION_OF: "version_of", // protected artwork → original artwork
    DERIVED_FROM: "derived_from", // fan-art → original, response → prompt
    PART_OF: "part_of", // episode → series, page → book
    // Semantic
    REFERENCES: "references", // illustration → poem, cover → song
    RESPONSE_TO: "response_to", // reply artwork → source artwork
    // Discovery
    TAGGED_WITH: "tagged_with", // entity → tag entity
    SIMILAR_TO: "similar_to", // artwork → artwork (ML similarity score in metadata)
} as const;

export type RelationType = (typeof RELATION_TYPES)[keyof typeof RELATION_TYPES];
