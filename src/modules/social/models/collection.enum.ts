// ─── Collection Roles ───────────────────────────────────────────────────────

export const CollectionRole = {
    OWNER: "owner",
    EDITOR: "editor",
    CONTRIBUTOR: "contributor",
    VIEWER: "viewer",
} as const;

export type CollectionRoleValue =
    (typeof CollectionRole)[keyof typeof CollectionRole];

// ─── Collection Visibility ───────────────────────────────────────────────────

export const CollectionVisibility = {
    PUBLIC: "public",
    PRIVATE: "private",
    UNLISTED: "unlisted",
} as const;

export type CollectionVisibilityValue =
    (typeof CollectionVisibility)[keyof typeof CollectionVisibility];

// ─── Membership Inheritance (collection → contained artworks) ────────────────
//   none:      no inheritance
//   viewer:    all collection members → viewer on artworks in collection
//   propagate: collection role maps 1:1 to artwork role
//              (owner→owner, editor→coauthor, contributor→contributor, viewer→viewer)

export const MembershipInheritance = {
    NONE: "none",
    VIEWER: "viewer",
    PROPAGATE: "propagate",
} as const;

export type MembershipInheritanceValue =
    (typeof MembershipInheritance)[keyof typeof MembershipInheritance];

// ─── Placement Context (where a collection appears) ──────────────────────────
//   portfolio: visible in an org/profile public portfolio page (contextId = organizationId)
//   workspace: pinned to a user's /artworks workspace  (contextId = userId)
//   feed:      featured in the public social feed       (contextId = organizationId | userId)

export const PlacementContext = {
    PORTFOLIO: "portfolio",
    WORKSPACE: "workspace",
    FEED: "feed",
    COLLECTION: "collection", // contextId = parent collectionId (nesting)
} as const;

export type PlacementContextValue =
    (typeof PlacementContext)[keyof typeof PlacementContext];

// ─── Access Source (how a member got their access) ───────────────────────────

export const AccessSource = {
    DIRECT: "direct",
    ORG: "org",
    COMMISSION: "commission",
} as const;

export type AccessSourceValue =
    (typeof AccessSource)[keyof typeof AccessSource];
