/**
 * `collection_members` has been superseded by node_relations type 'member_of'.
 * profile --[member_of]--> collection  (with role in metadata)
 *
 * This file is kept as a compat stub so existing imports don't break at compile time.
 */
export type CollectionMember = {
    id: number;
    collectionId: string;
    userId: string;
    role: string;
    sourceType: string;
    sourceId: string | null;
    grantedByUserId: string | null;
    expiresAt: string | null;
    grantedAt: string;
};
export type NewCollectionMember = Omit<CollectionMember, "id" | "grantedAt">;

export {
    CollectionRole,
    AccessSource,
    type CollectionRoleValue,
    type AccessSourceValue,
} from "@/modules/social/models/collection.enum";
