export type SortField = "createdAt" | "updatedAt" | "title";
export type SortOrder = "asc" | "desc";
export type VisibilityFilter = "all" | "public" | "private";

export interface WorkspaceQuery {
    collectionId?: string;
    sort: SortField;
    order: SortOrder;
    visibility: VisibilityFilter;
    offset: number;
    limit: number;
}

export const DEFAULT_QUERY: WorkspaceQuery = {
    sort: "createdAt",
    order: "desc",
    visibility: "all",
    offset: 0,
    limit: 15,
};

export function parseWorkspaceQuery(
    params: Record<string, string | undefined>,
    collectionId?: string,
): WorkspaceQuery {
    const validSorts: SortField[] = ["createdAt", "updatedAt", "title"];
    const validOrders: SortOrder[] = ["asc", "desc"];
    const validVisibility: VisibilityFilter[] = ["all", "public", "private"];

    return {
        collectionId,
        sort: validSorts.includes(params.sort as SortField)
            ? (params.sort as SortField)
            : DEFAULT_QUERY.sort,
        order: validOrders.includes(params.order as SortOrder)
            ? (params.order as SortOrder)
            : DEFAULT_QUERY.order,
        visibility: validVisibility.includes(
            params.visibility as VisibilityFilter,
        )
            ? (params.visibility as VisibilityFilter)
            : DEFAULT_QUERY.visibility,
        offset: 0,
        limit: DEFAULT_QUERY.limit,
    };
}

// ── Standard item types ───────────────────────────────────────────────────────

export type ArtworkWorkspaceItem = {
    kind: "artwork";
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    visibility: string;
    url: string;
    r2Key: string;
    width: number | null;
    height: number | null;
    protectionStatus: string;
    mediaType: "image";
    /** Owner-controlled: whether non-owners may download this artwork. */
    allowDownload: boolean;
};

export type FolderWorkspaceItem = {
    /** Always-private dir-like container. Move semantics: items inside disappear from root. */
    kind: "folder";
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    itemCount: number;
};

export type CollectionWorkspaceItem = {
    /** Cross-user board. Reference semantics: saved items still live at owner's root. */
    kind: "collection";
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    visibility: string;
    itemCount: number;
    role: string;
    coverUrl?: string | null;
};

export type WorkspaceItem =
    | ArtworkWorkspaceItem
    | FolderWorkspaceItem
    | CollectionWorkspaceItem;

export interface WorkspaceItemsResult {
    items: WorkspaceItem[];
    hasMore: boolean;
}
