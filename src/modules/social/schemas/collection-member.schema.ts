import {
    index,
    integer,
    sqliteTable,
    text,
    uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { user } from "@/modules/auth/schemas/auth.schema";
import { collections } from "@/modules/social/schemas/collection.schema";
import {
    AccessSource,
    CollectionRole,
    type AccessSourceValue,
    type CollectionRoleValue,
} from "@/modules/social/models/collection.enum";

export const collectionMembers = sqliteTable(
    "collection_members",
    {
        id: integer("id").primaryKey({ autoIncrement: true }),
        collectionId: text("collection_id")
            .notNull()
            .references(() => collections.id, { onDelete: "cascade" }),
        userId: text("user_id")
            .notNull()
            .references(() => user.id, { onDelete: "cascade" }),
        role: text("role")
            .$type<CollectionRoleValue>()
            .notNull()
            .default(CollectionRole.VIEWER),
        // How this grant was created — for audit and revocation by source
        sourceType: text("source_type")
            .$type<AccessSourceValue>()
            .notNull()
            .default(AccessSource.DIRECT),
        // organizationId (for org-sourced access) or commissionId — nullable
        sourceId: text("source_id"),
        grantedByUserId: text("granted_by_user_id").references(() => user.id, {
            onDelete: "set null",
        }),
        // Optional expiry — null = permanent
        expiresAt: text("expires_at"),
        grantedAt: text("granted_at")
            .notNull()
            .$defaultFn(() => new Date().toISOString()),
    },
    (table) => [
        uniqueIndex("collection_members_unique").on(
            table.collectionId,
            table.userId,
        ),
        index("idx_collection_members_collection").on(table.collectionId),
        index("idx_collection_members_user").on(table.userId),
    ],
);

export type CollectionMember = typeof collectionMembers.$inferSelect;
export type NewCollectionMember = typeof collectionMembers.$inferInsert;
