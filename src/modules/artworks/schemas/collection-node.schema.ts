import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { entities } from "@/modules/artworks/schemas/entity.schema";

/**
 * Collection subtype table.
 * Rows exist only for entities with type = 'collection'.
 *
 * Hierarchy and membership (N:M) are expressed via entity_relations with type='contains':
 *   collection --[contains]--> artwork
 *   collection --[contains]--> sub-collection
 *
 * item_count is a denormalized cache — updated atomically via sql`item_count + 1`.
 */
export const collectionNodes = sqliteTable(
    "collection_nodes",
    {
        // Primary key: same UUID as entities.id.
        id: text("id")
            .primaryKey()
            .references(() => entities.id, { onDelete: "cascade" }),

        name: text("name").notNull(),
        description: text("description"),
        coverImageUrl: text("cover_image_url"),

        // Denormalized counter — updated atomically
        itemCount: integer("item_count").notNull().default(0),
    },
    (table) => [index("idx_collection_nodes_name").on(table.name)],
);

export type CollectionNodeRow = typeof collectionNodes.$inferSelect;
export type NewCollectionNode = typeof collectionNodes.$inferInsert;
