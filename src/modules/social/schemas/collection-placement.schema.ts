/**
 * `collection_placements` has been superseded by node_relations type 'features'.
 * profile --[features]--> collection  (pinned/displayed in context)
 *
 * This file is kept as a compat stub so existing imports don't break at compile time.
 */
export type CollectionPlacement = {
    id: number;
    collectionId: string;
    contextType: string;
    contextId: string;
    displayOrder: number;
    isPinned: boolean;
    createdAt: string;
};
export type NewCollectionPlacement = Omit<
    CollectionPlacement,
    "id" | "createdAt"
>;

export {
    PlacementContext,
    type PlacementContextValue,
} from "@/modules/social/models/collection.enum";
