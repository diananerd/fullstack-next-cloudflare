/**
 * Compatibility re-export.
 * artwork_relations has been superseded by entity_relations (hypergraph model).
 * Code that imported artworkRelations continues to work unchanged.
 */
export {
    entityRelations as artworkRelations,
    type EntityRelation as ArtworkRelation,
    type NewEntityRelation as NewArtworkRelation,
} from "@/modules/artworks/schemas/entity-relation.schema";
