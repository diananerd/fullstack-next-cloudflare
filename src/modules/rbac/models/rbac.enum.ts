// ─── Artwork Access Roles ────────────────────────────────────────────────────
//
// Distinct from artwork_artists (attribution/credits).
// These govern *operational* access: who can do what.

export const ArtworkAccessRole = {
    OWNER: "owner",
    COAUTHOR: "coauthor",
    CONTRIBUTOR: "contributor",
    VIEWER: "viewer",
    CLIENT: "client",
} as const;

export type ArtworkAccessRoleValue =
    (typeof ArtworkAccessRole)[keyof typeof ArtworkAccessRole];

// ─── Artwork Actions ─────────────────────────────────────────────────────────

export const ArtworkAction = {
    VIEW: "view",
    DOWNLOAD_ORIGINAL: "download_original",
    DOWNLOAD_PROTECTED: "download_protected",
    EDIT: "edit",
    PROTECT: "protect",
    DELETE: "delete",
    MANAGE_ACCESS: "manage_access",
    PUBLISH: "publish",
} as const;

export type ArtworkActionValue =
    (typeof ArtworkAction)[keyof typeof ArtworkAction];

// ─── Collection Actions ───────────────────────────────────────────────────────

export const CollectionAction = {
    VIEW: "view",
    ADD_ITEM: "add_item",
    REMOVE_ITEM: "remove_item",
    REORDER: "reorder",
    EDIT: "edit",
    MANAGE_MEMBERS: "manage_members",
    DELETE: "delete",
    PLACE: "place",
} as const;

export type CollectionActionValue =
    (typeof CollectionAction)[keyof typeof CollectionAction];

// ─── Resource Types ───────────────────────────────────────────────────────────

export const ResourceType = {
    COLLECTION: "collection",
    ARTWORK: "artwork",
} as const;

export type ResourceTypeValue =
    (typeof ResourceType)[keyof typeof ResourceType];

// ─── Access Source (how access was granted) ──────────────────────────────────

export const ArtworkAccessSource = {
    DIRECT: "direct",
    COLLECTION: "collection",
    COMMISSION: "commission",
    ORG: "org",
} as const;

export type ArtworkAccessSourceValue =
    (typeof ArtworkAccessSource)[keyof typeof ArtworkAccessSource];

// ─── Default Policy Matrix ────────────────────────────────────────────────────
//
// Platform defaults — stored in resource_role_policies with resourceId = NULL.
// Resource owners can override per-resource by inserting rows with resourceId set.
//
// Collection role → allowed actions:
//   owner:       view, add_item, remove_item, reorder, edit, manage_members, delete, place
//   editor:      view, add_item, remove_item, reorder, edit
//   contributor: view, add_item
//   viewer:      view
//
// Artwork role → allowed actions:
//   owner:       view, download_original, download_protected, edit, protect, delete, manage_access, publish
//   coauthor:    view, download_original, download_protected, edit, protect
//   contributor: view, download_original, edit
//   viewer:      view
//   client:      view, download_protected

export const DEFAULT_COLLECTION_POLICIES: Record<string, string[]> = {
    owner: [
        "view",
        "add_item",
        "remove_item",
        "reorder",
        "edit",
        "manage_members",
        "delete",
        "place",
    ],
    editor: ["view", "add_item", "remove_item", "reorder", "edit"],
    contributor: ["view", "add_item"],
    viewer: ["view"],
};

export const DEFAULT_ARTWORK_POLICIES: Record<string, string[]> = {
    owner: [
        "view",
        "download_original",
        "download_protected",
        "edit",
        "protect",
        "delete",
        "manage_access",
        "publish",
    ],
    coauthor: [
        "view",
        "download_original",
        "download_protected",
        "edit",
        "protect",
    ],
    contributor: ["view", "download_original", "edit"],
    viewer: ["view"],
    client: ["view", "download_protected"],
};
