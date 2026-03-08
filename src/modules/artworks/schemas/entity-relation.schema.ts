import {
    index,
    real,
    sqliteTable,
    text,
    uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { user } from "@/modules/auth/schemas/auth.schema";
import { entities } from "@/modules/artworks/schemas/entity.schema";
import type { RelationType } from "@/constants/relation-types";

/**
 * Typed semantic edges — the hypergraph layer.
 *
 * Any entity can be related to any other entity with a typed, directional edge.
 * Bidirectional queries work via indices on both from_id and to_id.
 *
 * Examples:
 *   collection --[contains]--> artwork
 *   collection --[contains]--> sub-collection
 *   artwork    --[version_of]--> artwork (protected → original)
 *   artwork    --[derived_from]--> artwork
 *   artwork    --[similar_to]--> artwork  (score in metadata)
 *
 * Replaces: artwork_relations (artwork-only edges)
 *           workspace_items.parent_id (tree structure via 'contains')
 *           collection_items (collection membership via 'contains')
 */
export const entityRelations = sqliteTable(
    "entity_relations",
    {
        id: text("id")
            .primaryKey()
            .$defaultFn(() => crypto.randomUUID()),

        fromId: text("from_id")
            .notNull()
            .references(() => entities.id, { onDelete: "cascade" }),

        toId: text("to_id")
            .notNull()
            .references(() => entities.id, { onDelete: "cascade" }),

        type: text("type").$type<RelationType>().notNull(),

        // Float position for ordering within a container (e.g., items in collection).
        // LexoRank can be stored as a real; null = unordered.
        position: real("position"),

        // Relation-specific data: ML score, timestamp ranges, layer refs, etc.
        metadata: text("metadata", { mode: "json" }).$type<
            Record<string, unknown>
        >(),

        createdBy: text("created_by").references(() => user.id, {
            onDelete: "set null",
        }),
        createdAt: text("created_at")
            .notNull()
            .$defaultFn(() => new Date().toISOString()),
    },
    (table) => [
        // One typed edge per pair (deduplication at DB level)
        uniqueIndex("entity_relations_unique").on(
            table.fromId,
            table.toId,
            table.type,
        ),
        // "What does this entity contain / point to?"
        index("idx_entity_relations_from_type_pos").on(
            table.fromId,
            table.type,
            table.position,
        ),
        // "Which entities point to this one?" (reverse traversal)
        index("idx_entity_relations_to_type").on(table.toId, table.type),
        // Type-scoped full-graph queries
        index("idx_entity_relations_type").on(table.type),
    ],
);

export type EntityRelation = typeof entityRelations.$inferSelect;
export type NewEntityRelation = typeof entityRelations.$inferInsert;
