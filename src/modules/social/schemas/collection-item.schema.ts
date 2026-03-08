/**
 * `collection_items` has been superseded by node_relations type 'contains'.
 * collection --[contains]--> artwork  (same as entity_relations CONTAINS)
 *
 * This file is kept as a compat stub so existing imports don't break at compile time.
 */
export type CollectionItem = {
    id: number;
    collectionId: string;
    artworkId: string | null;
    externalUrl: string | null;
    externalTitle: string | null;
    externalImageUrl: string | null;
    note: string | null;
    position: number;
    addedByUserId: string | null;
    createdAt: string;
};
export type NewCollectionItem = Omit<CollectionItem, "id" | "createdAt">;
