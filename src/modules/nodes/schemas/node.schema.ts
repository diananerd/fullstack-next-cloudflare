import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { user } from "@/modules/auth/schemas/auth.schema";

/**
 * Universal graph node — base table for every entity in the domain.
 *
 * Node subtypes extend this with domain-specific fields:
 *   artwork   → artworks table
 *   collection → collection_nodes table
 *   profile   → profile_nodes table (1:1 with better-auth organization)
 *   tag       → tag_nodes (future)
 *   product   → product_nodes (future)
 *   service   → service_nodes (future)
 *   event     → event_nodes (future)
 *
 * New types can be added without schema migrations — just create a subtype table.
 *
 * createdBy = auth/billing anchor (the user account that created this node).
 *   For profile nodes: the org creator.
 *   For artworks/collections: the uploading/creating user.
 *
 * workspace_id = null → personal / ungrouped item.
 */
export type NodeType =
    | "artwork"
    | "collection"
    | "profile"
    | "tag"
    | "concept"
    | (string & {});

export const nodes = sqliteTable(
    "nodes",
    {
        id: text("id")
            .primaryKey()
            .$defaultFn(() => crypto.randomUUID()),

        type: text("type").$type<NodeType>().notNull(),

        // Auth + billing anchor. The user account responsible for this node.
        createdBy: text("created_by")
            .notNull()
            .references(() => user.id, { onDelete: "cascade" }),

        workspaceId: text("workspace_id"),

        visibility: text("visibility").notNull().default("private"),

        createdAt: text("created_at")
            .notNull()
            .$defaultFn(() => new Date().toISOString()),
        updatedAt: text("updated_at")
            .notNull()
            .$defaultFn(() => new Date().toISOString()),
    },
    (table) => [
        index("idx_nodes_created_by_type").on(table.createdBy, table.type),
        index("idx_nodes_workspace_type").on(table.workspaceId, table.type),
        index("idx_nodes_visibility").on(table.visibility),
        index("idx_nodes_type").on(table.type),
    ],
);

export type NodeRow = typeof nodes.$inferSelect;
export type NewNode = typeof nodes.$inferInsert;
