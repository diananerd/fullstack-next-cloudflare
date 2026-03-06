import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { user } from "@/modules/auth/schemas/auth.schema";
import {
    CollectionVisibility,
    MembershipInheritance,
    type CollectionVisibilityValue,
    type MembershipInheritanceValue,
} from "@/modules/social/models/collection.enum";

export {
    CollectionVisibility,
    MembershipInheritance,
    type CollectionVisibilityValue,
    type MembershipInheritanceValue,
};

export const collections = sqliteTable(
    "collections",
    {
        id: text("id")
            .primaryKey()
            .$defaultFn(() => crypto.randomUUID()),
        // Creator always becomes owner in collection_members.
        // Kept here for provenance, billing, and hard-delete ownership checks.
        createdByUserId: text("created_by_user_id")
            .notNull()
            .references(() => user.id, { onDelete: "restrict" }),
        title: text("title").notNull(),
        description: text("description"),
        coverR2Key: text("cover_r2_key"),
        coverUrl: text("cover_url"),
        visibility: text("visibility")
            .$type<CollectionVisibilityValue>()
            .notNull()
            .default(CollectionVisibility.PRIVATE),
        // Controls whether collection membership automatically grants access
        // to the artworks contained in this collection.
        membershipInheritance: text("membership_inheritance")
            .$type<MembershipInheritanceValue>()
            .notNull()
            .default(MembershipInheritance.NONE),
        // Denormalized counter — updated atomically via sql`item_count + 1`
        itemCount: integer("item_count").notNull().default(0),
        createdAt: text("created_at")
            .notNull()
            .$defaultFn(() => new Date().toISOString()),
        updatedAt: text("updated_at")
            .notNull()
            .$defaultFn(() => new Date().toISOString()),
    },
    (table) => [
        index("idx_collections_created_by").on(table.createdByUserId),
        index("idx_collections_visibility").on(table.visibility),
    ],
);

export type Collection = typeof collections.$inferSelect;
export type NewCollection = typeof collections.$inferInsert;
