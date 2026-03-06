import {
    index,
    integer,
    sqliteTable,
    text,
    uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { user } from "@/modules/auth/schemas/auth.schema";
import { organization } from "@/modules/profiles/schemas/org-plugin.schema";

export const profileFollows = sqliteTable(
    "profile_follows",
    {
        id: integer("id").primaryKey({ autoIncrement: true }),
        followerUserId: text("follower_user_id")
            .notNull()
            .references(() => user.id, { onDelete: "cascade" }),
        followingOrganizationId: text("following_organization_id")
            .notNull()
            .references(() => organization.id, { onDelete: "cascade" }),
        createdAt: text("created_at")
            .notNull()
            .$defaultFn(() => new Date().toISOString()),
    },
    (table) => [
        uniqueIndex("profile_follows_unique").on(
            table.followerUserId,
            table.followingOrganizationId,
        ),
        index("idx_profile_follows_follower").on(table.followerUserId),
        index("idx_profile_follows_following").on(
            table.followingOrganizationId,
        ),
    ],
);

export type ProfileFollow = typeof profileFollows.$inferSelect;
export type NewProfileFollow = typeof profileFollows.$inferInsert;
