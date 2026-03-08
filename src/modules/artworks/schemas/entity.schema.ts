/**
 * Compatibility re-export.
 * The canonical definition is now `src/modules/nodes/schemas/node.schema.ts`.
 * Code that imports `entities` / `EntityRow` / `NewEntity` continues to work unchanged.
 */
export {
    nodes as entities,
    type NodeRow as EntityRow,
    type NewNode as NewEntity,
    type NodeType,
} from "@/modules/nodes/schemas/node.schema";
