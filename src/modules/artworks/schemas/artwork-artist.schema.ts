/**
 * `artwork_artists` has been superseded by node_relations.
 * Use typed edges instead:
 *   profile --[creates]-->      artwork  (primary creator)
 *   profile --[collaborates]--> artwork  (co-creator)
 *   profile --[commissioned]--> artwork  (funded/requested)
 *   profile --[subjects]-->     artwork  (depicted in)
 *   profile --[curates]-->      collection
 *
 * This file is kept as a compat stub so existing type imports don't break.
 */

export const ArtworkRole = {
    CREATOR: "creates",
    COLLABORATOR: "collaborates",
    COMMISSIONER: "commissioned",
    SUBJECT: "subjects",
    CURATOR: "curates",
} as const;

export type ArtworkRoleType =
    | (typeof ArtworkRole)[keyof typeof ArtworkRole]
    | (string & {});

export type ArtworkArtist = {
    id: number;
    artworkId: string;
    userId: string;
    role: string;
    note: string | null;
    addedAt: string;
};
export type NewArtworkArtist = Omit<ArtworkArtist, "id" | "addedAt">;
