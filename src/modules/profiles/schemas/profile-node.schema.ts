import {
    index,
    integer,
    sqliteTable,
    text,
    uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { nodes } from "@/modules/nodes/schemas/node.schema";
import { organization } from "@/modules/profiles/schemas/org-plugin.schema";

/**
 * Profile subtype — the public actor in the domain graph.
 * Every organization (better-auth) has exactly one profile_node.
 *
 * A profile is the public identity that:
 *   - creates and owns artworks     (profile --[creates]--> artwork)
 *   - follows other profiles        (profile --[follows]--> profile)
 *   - features artworks/collections (profile --[features]--> artwork)
 *   - licenses, sells, purchases    (profile --[licenses|sells|purchases]--> node)
 *
 * One user can manage multiple profiles (multiple orgs via better-auth member table).
 * Profile metadata (name, bio, avatar, profileType, stripeConnect…)
 * lives on the `organization` table and is managed by better-auth.
 */
export const profileNodes = sqliteTable(
    "profile_nodes",
    {
        // Same UUID as nodes.id (and organization.id).
        id: text("id")
            .primaryKey()
            .references(() => nodes.id, { onDelete: "cascade" }),

        // 1:1 with better-auth organization
        orgId: text("org_id")
            .notNull()
            .references(() => organization.id, { onDelete: "cascade" }),

        // Denormalized counters — updated via server actions, not DB triggers.
        // These avoid expensive COUNT aggregates on node_relations at read time.
        artworkCount: integer("artwork_count").notNull().default(0),
        followerCount: integer("follower_count").notNull().default(0),
        followingCount: integer("following_count").notNull().default(0),
    },
    (table) => [
        uniqueIndex("profile_nodes_org_id_unique").on(table.orgId),
        index("idx_profile_nodes_org_id").on(table.orgId),
    ],
);

export type ProfileNodeRow = typeof profileNodes.$inferSelect;
export type NewProfileNode = typeof profileNodes.$inferInsert;
