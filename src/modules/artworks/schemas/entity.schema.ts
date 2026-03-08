import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { user } from "@/modules/auth/schemas/auth.schema";

/**
 * Generic base node for the hypergraph.
 * Every artwork, collection, tag, etc. is an entity.
 * Type-specific data lives in subtype tables (artworks, collection_nodes, …).
 *
 * workspace_id = null → personal item (user's private workspace).
 */
export const entities = sqliteTable(
    "entities",
    {
        id: text("id")
            .primaryKey()
            .$defaultFn(() => crypto.randomUUID()),

        type: text("type").$type<"artwork" | "collection">().notNull(),

        // null = personal item (belongs to creator only, no shared workspace)
        workspaceId: text("workspace_id"),

        createdBy: text("created_by")
            .notNull()
            .references(() => user.id, { onDelete: "cascade" }),

        visibility: text("visibility").notNull().default("private"),

        createdAt: text("created_at")
            .notNull()
            .$defaultFn(() => new Date().toISOString()),
        updatedAt: text("updated_at")
            .notNull()
            .$defaultFn(() => new Date().toISOString()),
    },
    (table) => [
        index("idx_entities_created_by_type").on(table.createdBy, table.type),
        index("idx_entities_workspace_type").on(table.workspaceId, table.type),
        index("idx_entities_visibility").on(table.visibility),
    ],
);

export type EntityRow = typeof entities.$inferSelect;
export type NewEntity = typeof entities.$inferInsert;
