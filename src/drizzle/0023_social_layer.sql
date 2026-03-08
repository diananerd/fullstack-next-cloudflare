-- Migration 0023: Social publication layer
-- ---------------------------------------------------------------------------
-- Adds the social layer as a domain-specific wrapper over ontological nodes.
-- Likes, comments, and views attach to social_posts, NOT to nodes directly.
--
-- Principle: nodes (artworks, collections, profiles) are abstract ontological
-- facts. social_posts is the act of publishing a node into a social context.
-- ---------------------------------------------------------------------------

-- social_posts: publication event — one node can be posted many times
CREATE TABLE social_posts (
    id TEXT PRIMARY KEY NOT NULL,
    node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    profile_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    caption TEXT,
    visibility TEXT NOT NULL DEFAULT 'public',
    reaction_count INTEGER NOT NULL DEFAULT 0,
    comment_count INTEGER NOT NULL DEFAULT 0,
    view_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX idx_social_posts_profile_created    ON social_posts (profile_id, created_at);
CREATE INDEX idx_social_posts_node_created       ON social_posts (node_id, created_at);
CREATE INDEX idx_social_posts_visibility_created ON social_posts (visibility, created_at);

-- social_reactions: likes/hearts/etc. attributed to profiles
CREATE TABLE social_reactions (
    id TEXT PRIMARY KEY NOT NULL,
    post_id TEXT NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
    profile_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    type TEXT NOT NULL DEFAULT 'like',
    created_at TEXT NOT NULL,
    UNIQUE (post_id, profile_id, type)
);

CREATE INDEX idx_social_reactions_post    ON social_reactions (post_id);
CREATE INDEX idx_social_reactions_profile ON social_reactions (profile_id);

-- social_comments: threaded comments attributed to profiles
-- parent_id = null → top-level; parent_id → reply to another comment
-- Soft-deleted: body nulled out, deleted_at set, thread structure preserved
CREATE TABLE social_comments (
    id TEXT PRIMARY KEY NOT NULL,
    post_id TEXT NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
    parent_id TEXT REFERENCES social_comments(id) ON DELETE CASCADE,
    profile_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    body TEXT,
    reply_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);

CREATE INDEX idx_social_comments_post_parent_created ON social_comments (post_id, parent_id, created_at);
CREATE INDEX idx_social_comments_profile             ON social_comments (profile_id);
CREATE INDEX idx_social_comments_parent              ON social_comments (parent_id);
