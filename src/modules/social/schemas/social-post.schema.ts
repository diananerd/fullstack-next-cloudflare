import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { nodes } from "@/modules/nodes/schemas/node.schema";

/**
 * Social post — the publication event that places a node into a social feed.
 *
 * A `node` (artwork, collection, profile) is an abstract ontological entity.
 * A `social_post` is the act of *publishing* that node into a social context.
 * Likes, comments and views attach to the post, NOT to the node itself.
 *
 * One node can appear in many posts (e.g. an artwork reposted over time).
 * One profile can post many times about the same node (different captions, contexts).
 *
 * profile_id MUST reference a node with type='profile'.
 */
export const socialPosts = sqliteTable(
    "social_posts",
    {
        id: text("id")
            .primaryKey()
            .$defaultFn(() => crypto.randomUUID()),

        // The node being published (artwork, collection, or profile highlight)
        nodeId: text("node_id")
            .notNull()
            .references(() => nodes.id, { onDelete: "cascade" }),

        // The profile (org) publishing this post
        profileId: text("profile_id")
            .notNull()
            .references(() => nodes.id, { onDelete: "cascade" }),

        caption: text("caption"),

        visibility: text("visibility").notNull().default("public"),

        // Denormalized counters — updated by server actions
        reactionCount: integer("reaction_count").notNull().default(0),
        commentCount: integer("comment_count").notNull().default(0),
        viewCount: integer("view_count").notNull().default(0),

        createdAt: text("created_at")
            .notNull()
            .$defaultFn(() => new Date().toISOString()),
        updatedAt: text("updated_at")
            .notNull()
            .$defaultFn(() => new Date().toISOString()),
    },
    (table) => [
        // Feed for a profile: "all posts by this profile, newest first"
        index("idx_social_posts_profile_created").on(
            table.profileId,
            table.createdAt,
        ),
        // All posts about a node: "every time this artwork was posted"
        index("idx_social_posts_node_created").on(
            table.nodeId,
            table.createdAt,
        ),
        // Public feed queries
        index("idx_social_posts_visibility_created").on(
            table.visibility,
            table.createdAt,
        ),
    ],
);

export type SocialPost = typeof socialPosts.$inferSelect;
export type NewSocialPost = typeof socialPosts.$inferInsert;
