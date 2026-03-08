import {
    index,
    integer,
    real,
    sqliteTable,
    text,
    uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { user } from "@/modules/auth/schemas/auth.schema";
import { nodes } from "@/modules/nodes/schemas/node.schema";
import type { RelationType } from "@/constants/relation-types";

/**
 * Universal typed semantic edges — the hypergraph layer.
 *
 * Any node can be related to any other node with a typed, directional edge.
 * Bidirectional queries work via indices on both from_id and to_id.
 *
 * Examples:
 *   profile    --[creates]-->     artwork         (artist → work)
 *   profile    --[follows]-->     profile         (social graph)
 *   profile    --[features]-->    artwork         (portfolio)
 *   profile    --[licenses]-->    artwork         (commerce)
 *   collection --[contains]-->    artwork         (curation)
 *   artwork    --[version_of]--> artwork          (provenance)
 *   artwork    --[similar_to]--> artwork          (ML score in metadata)
 *
 * `slot` is an optional discriminator for parallel edges of the same type
 * between the same pair of nodes. Default '' covers most cases.
 * Use a meaningful identifier (e.g. "context_id", "season_2") when needed.
 *
 * Replaces: entity_relations, artwork_relations, artwork_artists,
 *           portfolio_artworks, profile_follows, collection_members,
 *           collection_items, collection_placements.
 */
export const nodeRelations = sqliteTable(
    "node_relations",
    {
        id: text("id")
            .primaryKey()
            .$defaultFn(() => crypto.randomUUID()),

        fromId: text("from_id")
            .notNull()
            .references(() => nodes.id, { onDelete: "cascade" }),

        toId: text("to_id")
            .notNull()
            .references(() => nodes.id, { onDelete: "cascade" }),

        type: text("type").$type<RelationType>().notNull(),

        // Float position for ordering within a container (items in collection, etc.)
        position: real("position"),

        // Optional discriminator for parallel edges of same type between same pair.
        // UNIQUE constraint is on (from, to, type, slot).
        slot: text("slot").notNull().default(""),

        // Attribution / credit weight for this edge (0.0 – 1.0).
        // On `creates` edges: creator's share of credit (all creators of a work should sum to 1.0).
        // On `derived_from` / `remix_of` / `sample_of` edges: royalty fraction flowing upstream.
        // NULL = unspecified / irrelevant for this edge type.
        weight: real("weight"),

        // Time-bounded edges (ISO 8601 strings).
        // NULL = no start/end constraint (permanent relationship).
        // Use for: licenses with expiry, temporary collaborations, residencies, etc.
        validFrom: text("valid_from"),
        validUntil: text("valid_until"),

        // Relation-specific data: ML score, license terms, transaction ref, role, etc.
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
        // One typed edge per (from, to, type, slot)
        uniqueIndex("node_relations_unique").on(
            table.fromId,
            table.toId,
            table.type,
            table.slot,
        ),
        // "What does this node point to / contain?"
        index("idx_node_relations_from_type_pos").on(
            table.fromId,
            table.type,
            table.position,
        ),
        // "Which nodes point to this one?" — reverse traversal with recency sort
        index("idx_node_relations_to_type_created").on(
            table.toId,
            table.type,
            table.createdAt,
        ),
        // Type-scoped full-graph queries
        index("idx_node_relations_type").on(table.type),
        // Active-only queries (temporal filtering: WHERE valid_until IS NULL OR valid_until > now)
        index("idx_node_relations_valid_until").on(table.validUntil),
    ],
);

export type NodeRelation = typeof nodeRelations.$inferSelect;
export type NewNodeRelation = typeof nodeRelations.$inferInsert;
