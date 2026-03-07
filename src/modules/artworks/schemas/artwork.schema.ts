/**
 * Compatibility re-export.
 * The canonical definition is `workspace-item.schema.ts`.
 * Code that imports from here continues to work unchanged.
 */
export {
    workspaceItems as artworks,
    insertArtworkSchema,
    selectArtworkSchema,
    updateArtworkSchema,
    type WorkspaceItemRow,
    type Artwork,
    type NewWorkspaceItem as NewArtwork,
} from "./workspace-item.schema";
