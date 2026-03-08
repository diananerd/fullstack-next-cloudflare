/**
 * Compatibility re-export.
 * The canonical definition is now `src/modules/nodes/schemas/node-relation.schema.ts`.
 * Code that imports `entityRelations` / `EntityRelation` continues to work unchanged.
 */
export {
    nodeRelations as entityRelations,
    type NodeRelation as EntityRelation,
    type NewNodeRelation as NewEntityRelation,
} from "@/modules/nodes/schemas/node-relation.schema";
