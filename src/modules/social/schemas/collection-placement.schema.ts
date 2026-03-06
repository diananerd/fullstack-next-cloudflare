import {
    index,
    integer,
    sqliteTable,
    text,
    uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { collections } from "@/modules/social/schemas/collection.schema";
import {
    PlacementContext,
    type PlacementContextValue,
} from "@/modules/social/models/collection.enum";

export const collectionPlacements = sqliteTable(
    "collection_placements",
    {
        id: integer("id").primaryKey({ autoIncrement: true }),
        collectionId: text("collection_id")
            .notNull()
            .references(() => collections.id, { onDelete: "cascade" }),
        // Context in which this collection appears
        contextType: text("context_type")
            .$type<PlacementContextValue>()
            .notNull(),
        // Polymorphic entity ID — interpretation depends on contextType:
        //   portfolio → organizationId
        //   workspace → userId
        //   feed      → organizationId | userId
        contextId: text("context_id").notNull(),
        // Display order within this context (lower = first)
        displayOrder: integer("display_order").notNull().default(0),
        isPinned: integer("is_pinned", { mode: "boolean" })
            .notNull()
            .default(false),
        createdAt: text("created_at")
            .notNull()
            .$defaultFn(() => new Date().toISOString()),
    },
    (table) => [
        // A collection can appear only once per (context, entity)
        uniqueIndex("collection_placements_unique").on(
            table.collectionId,
            table.contextType,
            table.contextId,
        ),
        // "give me all collections in workspace X" / "portfolio of org Y"
        index("idx_collection_placements_context").on(
            table.contextType,
            table.contextId,
        ),
    ],
);

export type CollectionPlacement = typeof collectionPlacements.$inferSelect;
export type NewCollectionPlacement = typeof collectionPlacements.$inferInsert;
