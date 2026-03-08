import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { nodes } from "@/modules/nodes/schemas/node.schema";
import { socialPosts } from "@/modules/social/schemas/social-post.schema";

/**
 * Social comment — threaded comment on a post, attributed to a profile.
 *
 * Threading is single-level via parent_id (reply to top-level comment).
 * Deeper nesting collapses to the top-level thread in the UI.
 *
 * Soft-deleted via deleted_at — body is nulled out on delete to remove content
 * while preserving thread structure (replies remain visible).
 *
 * Reactions on comments reuse the same social_reactions table via
 * a future comment_id column if needed; for now reactions are post-only.
 */
export const socialComments = sqliteTable(
    "social_comments",
    {
        id: text("id")
            .primaryKey()
            .$defaultFn(() => crypto.randomUUID()),

        postId: text("post_id")
            .notNull()
            .references(() => socialPosts.id, { onDelete: "cascade" }),

        // null = top-level comment; non-null = reply to a comment on the same post
        parentId: text("parent_id"),

        // Profile (node type='profile') commenting
        profileId: text("profile_id")
            .notNull()
            .references(() => nodes.id, { onDelete: "cascade" }),

        body: text("body"),

        // Denormalized reply count (only meaningful on top-level comments)
        replyCount: integer("reply_count").notNull().default(0),

        createdAt: text("created_at")
            .notNull()
            .$defaultFn(() => new Date().toISOString()),
        updatedAt: text("updated_at")
            .notNull()
            .$defaultFn(() => new Date().toISOString()),

        // Soft delete: body → null, deletedAt set. Thread structure preserved.
        deletedAt: text("deleted_at"),
    },
    (table) => [
        // Top-level comments on a post, chronological
        index("idx_social_comments_post_parent_created").on(
            table.postId,
            table.parentId,
            table.createdAt,
        ),
        // All comments by a profile (activity, moderation)
        index("idx_social_comments_profile").on(table.profileId),
        // Replies to a comment
        index("idx_social_comments_parent").on(table.parentId),
    ],
);

export type SocialComment = typeof socialComments.$inferSelect;
export type NewSocialComment = typeof socialComments.$inferInsert;
