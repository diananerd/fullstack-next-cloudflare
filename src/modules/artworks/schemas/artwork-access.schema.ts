/**
 * Compatibility re-export.
 * The canonical definition is now `src/modules/nodes/schemas/node-access.schema.ts`.
 * Code that imports `artworkAccess` / `ArtworkAccess` continues to work unchanged.
 */
export {
    nodeAccess as artworkAccess,
    type NodeAccess as ArtworkAccess,
    type NewNodeAccess as NewArtworkAccess,
} from "@/modules/nodes/schemas/node-access.schema";
