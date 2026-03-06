// ─── Artwork Semantic Type ────────────────────────────────────────────────────
// What the work *is* conceptually — independent of its file format.

export const ArtworkSemanticType = {
    PAINTING: "painting",
    DRAWING: "drawing",
    ILLUSTRATION: "illustration",
    PHOTOGRAPHY: "photography",
    DIGITAL_ART: "digital_art",
    SCULPTURE: "sculpture",
    INSTALLATION: "installation",
    POETRY: "poetry",
    PROSE: "prose",
    SCREENPLAY: "screenplay",
    MUSIC: "music",
    SOUND_DESIGN: "sound_design",
    ANIMATION: "animation",
    SHORT_FILM: "short_film",
    FILM: "film",
    SERIES: "series",
    MODEL_3D: "model_3d",
    GAME_ASSET: "game_asset",
    COMIC: "comic",
    GRAPHIC_NOVEL: "graphic_novel",
    MIXED_MEDIA: "mixed_media",
    PERFORMANCE: "performance",
    OTHER: "other",
} as const;

export type ArtworkSemanticTypeValue =
    (typeof ArtworkSemanticType)[keyof typeof ArtworkSemanticType];

// ─── Media Format ─────────────────────────────────────────────────────────────
// The technical nature of the file — what kind of media it is.

export const MediaFormat = {
    IMAGE: "image",
    AUDIO: "audio",
    VIDEO: "video",
    MODEL_3D: "model_3d",
    DOCUMENT: "document",
    TEXT: "text",
    ARCHIVE: "archive",
    OTHER: "other",
} as const;

export type MediaFormatValue = (typeof MediaFormat)[keyof typeof MediaFormat];

// ─── Artwork File Role ────────────────────────────────────────────────────────
// Role of a specific file within a multi-file artwork.
//   primary:    The canonical/main file (always exactly one per artwork)
//   preview:    Low-res or thumbnail version for fast display
//   protected:  Output of Drimit's protection pipeline
//   variant:    Same content, different format (e.g. WebP + PNG)
//   attachment: Supporting material (textures, subtitles, score, etc.)
//   source:     Raw source file (e.g. .psd, .blend, .aep)
//   export:     Processed export (e.g. rendered video, printed PDF)

export const ArtworkFileRole = {
    PRIMARY: "primary",
    PREVIEW: "preview",
    PROTECTED: "protected",
    VARIANT: "variant",
    ATTACHMENT: "attachment",
    SOURCE: "source",
    EXPORT: "export",
} as const;

export type ArtworkFileRoleValue =
    (typeof ArtworkFileRole)[keyof typeof ArtworkFileRole];

// ─── Artwork Relationship Type ────────────────────────────────────────────────
// Semantic edge types between artworks or between artworks and entities.

export const ArtworkRelationType = {
    // Work-to-work
    DERIVED_FROM: "derived_from", // this is a derivative/remix of another
    PART_OF: "part_of", // episode/chapter of a series
    REFERENCES: "references", // cites/draws inspiration from
    RESPONSE_TO: "response_to", // artistic response/dialogue
    COLLAB_WITH: "collab_with", // collaborative piece
    // Work-to-person (entity relationships tracked in artwork_credits)
    // These appear here for completeness — artwork_credits.role uses ArtworkCreditRole
} as const;

export type ArtworkRelationTypeValue =
    (typeof ArtworkRelationType)[keyof typeof ArtworkRelationType];

// ─── Artwork Credit Role ──────────────────────────────────────────────────────
// Semantic credit/participation role — distinct from *access* (artwork_access)
// and from *commercial* credits (credits ledger).
// A user can hold multiple credit roles on the same artwork.

export const ArtworkCreditRole = {
    // Authorship / Creation
    AUTHOR: "author", // Primary creator
    COAUTHOR: "coauthor", // Co-creator with equal standing
    ILLUSTRATOR: "illustrator",
    PHOTOGRAPHER: "photographer",
    DIRECTOR: "director",
    PRODUCER: "producer",
    COMPOSER: "composer",
    WRITER: "writer",
    EDITOR: "editor",
    COLORIST: "colorist",
    // Participation / Contribution
    COLLABORATOR: "collaborator", // Generic contribution
    VOICE_ACTOR: "voice_actor",
    ACTOR: "actor",
    MODEL: "model", // Person depicted / modeling subject
    SUBJECT: "subject", // Person/thing depicted in work
    // Curatorial / Institutional
    CURATOR: "curator",
    PUBLISHER: "publisher",
    GALLERY: "gallery",
    // Commission / Support
    COMMISSIONER: "commissioner", // Person who commissioned the work
    PATRON: "patron", // Financial supporter / Mecenas
} as const;

export type ArtworkCreditRoleValue =
    (typeof ArtworkCreditRole)[keyof typeof ArtworkCreditRole];

// ─── Artwork Snapshot Reason ──────────────────────────────────────────────────

export const SnapshotReason = {
    MANUAL: "manual",
    AUTO_PROTECTION: "auto_protection",
    AUTO_PUBLISH: "auto_publish",
    BEFORE_EDIT: "before_edit",
} as const;

export type SnapshotReasonValue =
    (typeof SnapshotReason)[keyof typeof SnapshotReason];
