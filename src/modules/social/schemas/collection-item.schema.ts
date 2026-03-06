import {
    index,
    integer,
    sqliteTable,
    text,
    uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { user } from "@/modules/auth/schemas/auth.schema";
import { artworks } from "@/modules/artworks/schemas/artwork.schema";
import { collections } from "@/modules/social/schemas/collection.schema";

export const collectionItems = sqliteTable(
    "collection_items",
    {
        id: integer("id").primaryKey({ autoIncrement: true }),
        collectionId: text("collection_id")
            .notNull()
            .references(() => collections.id, { onDelete: "cascade" }),
        // One of artworkId OR externalUrl must be set — enforced at app layer
        artworkId: integer("artwork_id").references(() => artworks.id, {
            onDelete: "cascade",
        }),
        externalUrl: text("external_url"),
        externalTitle: text("external_title"),
        externalImageUrl: text("external_image_url"),
        note: text("note"),
        // Explicit ordering — caller manages gaps; reorder via full-range update
        position: integer("position").notNull().default(0),
        addedByUserId: text("added_by_user_id").references(() => user.id, {
            onDelete: "set null",
        }),
        createdAt: text("created_at")
            .notNull()
            .$defaultFn(() => new Date().toISOString()),
    },
    (table) => [
        // SQLite treats NULL as distinct in unique indexes → multiple external items OK
        uniqueIndex("collection_items_coll_artwork_unique").on(
            table.collectionId,
            table.artworkId,
        ),
        index("idx_collection_items_coll_position").on(
            table.collectionId,
            table.position,
        ),
        index("idx_collection_items_artwork").on(table.artworkId),
    ],
);

export type CollectionItem = typeof collectionItems.$inferSelect;
export type NewCollectionItem = typeof collectionItems.$inferInsert;
