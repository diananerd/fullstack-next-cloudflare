import { index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { nodes } from "@/modules/nodes/schemas/node.schema";
import { socialPosts } from "@/modules/social/schemas/social-post.schema";

/**
 * Social reaction — a profile's reaction to a post.
 *
 * Reactions are attributed to profiles (orgs), not to users directly.
 * A profile can react once per (post, type) pair.
 *
 * Types are open strings — the application layer constrains the valid set.
 * Current expected values: 'like' | 'heart' | 'fire' | 'wow' | 'sad'
 */
export const socialReactions = sqliteTable(
    "social_reactions",
    {
        id: text("id")
            .primaryKey()
            .$defaultFn(() => crypto.randomUUID()),

        postId: text("post_id")
            .notNull()
            .references(() => socialPosts.id, { onDelete: "cascade" }),

        // Profile (node type='profile') reacting
        profileId: text("profile_id")
            .notNull()
            .references(() => nodes.id, { onDelete: "cascade" }),

        type: text("type").notNull().default("like"),

        createdAt: text("created_at")
            .notNull()
            .$defaultFn(() => new Date().toISOString()),
    },
    (table) => [
        // One reaction per (post, profile, type)
        uniqueIndex("social_reactions_unique").on(
            table.postId,
            table.profileId,
            table.type,
        ),
        // "All reactions on a post"
        index("idx_social_reactions_post").on(table.postId),
        // "All reactions by a profile" (activity feed, undo)
        index("idx_social_reactions_profile").on(table.profileId),
    ],
);

export type SocialReaction = typeof socialReactions.$inferSelect;
export type NewSocialReaction = typeof socialReactions.$inferInsert;
