/**
 * The `collections` table has been unified with `collection_nodes` (hypergraph).
 * All collections are now graph nodes — they no longer need a separate table.
 *
 * Membership  → node_relations type 'member_of'
 * Items       → node_relations type 'contains'
 * Placements  → node_relations type 'features'
 *
 * The `Collection` type is a compat alias for `CollectionNode` from the
 * workspace-item schema so UI components continue to compile unchanged.
 */
export type {
    CollectionNode as Collection,
    CollectionNode,
} from "@/modules/artworks/schemas/workspace-item.schema";

// Enums kept for any code still importing them
export {
    CollectionVisibility,
    MembershipInheritance,
    type CollectionVisibilityValue,
    type MembershipInheritanceValue,
} from "@/modules/social/models/collection.enum";
