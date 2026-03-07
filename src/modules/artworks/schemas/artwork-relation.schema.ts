import {
    index,
    integer,
    sqliteTable,
    text,
    uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { user } from "@/modules/auth/schemas/auth.schema";
import { artworks } from "@/modules/artworks/schemas/artwork.schema";
import {
    ArtworkRelationType,
    type ArtworkRelationTypeValue,
} from "@/modules/artworks/models/artwork-media.enum";

// Directed semantic edges between artworks.
// "sourceArtworkId --[type]--> targetArtworkId"
//
// Examples:
//   film episode → part_of → series
//   fan-art      → derived_from → original_artwork
//   illustration → references → poem
//   cover song   → response_to → original_song
//
// Enriched derivation: when type = "derived_from", the metadata JSON
// can carry exact references (timestamp ranges, layer names, file hashes)
// pointing to the specific content that was used as a base.

export const artworkRelations = sqliteTable(
    "artwork_relations",
    {
        id: integer("id").primaryKey({ autoIncrement: true }),
        sourceArtworkId: text("source_artwork_id")
            .notNull()
            .references(() => artworks.id, { onDelete: "cascade" }),
        targetArtworkId: text("target_artwork_id")
            .notNull()
            .references(() => artworks.id, { onDelete: "restrict" }),
        relationType: text("relation_type")
            .$type<ArtworkRelationTypeValue>()
            .notNull(),
        // Enriched reference data — e.g. specific file range, layer, snapshot hash
        // Structure is relation-type–specific; validated at app layer
        referenceMetadata: text("reference_metadata", {
            mode: "json",
        }).$type<Record<string, unknown>>(),
        createdByUserId: text("created_by_user_id").references(() => user.id, {
            onDelete: "set null",
        }),
        createdAt: text("created_at")
            .notNull()
            .$defaultFn(() => new Date().toISOString()),
    },
    (table) => [
        uniqueIndex("artwork_relations_unique").on(
            table.sourceArtworkId,
            table.targetArtworkId,
            table.relationType,
        ),
        index("idx_artwork_relations_source").on(table.sourceArtworkId),
        index("idx_artwork_relations_target").on(table.targetArtworkId),
    ],
);

export type ArtworkRelation = typeof artworkRelations.$inferSelect;
export type NewArtworkRelation = typeof artworkRelations.$inferInsert;
