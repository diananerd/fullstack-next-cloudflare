import {
    index,
    integer,
    sqliteTable,
    text,
    uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { user } from "@/modules/auth/schemas/auth.schema";
import { nodes } from "@/modules/nodes/schemas/node.schema";
import {
    ArtworkAccessRole,
    ArtworkAccessSource,
    type ArtworkAccessRoleValue,
    type ArtworkAccessSourceValue,
} from "@/modules/rbac/models/rbac.enum";

/**
 * Operational access grants for any node type.
 * Generalizes the former artwork_access table.
 *
 * Effective permissions are resolved at query time:
 *   1. Direct grant (sourceType = "direct")
 *   2. Commission grant (sourceType = "commission")
 *   3. Collection-inherited (sourceType = "collection")
 *   4. Org-sourced (sourceType = "org")
 *   5. Public (node.visibility = "public") — implicit, no row needed
 *
 * Node owner (nodes.createdBy === session.userId) → implicit full access.
 * One row per (nodeId, userId) — most-permissive effective role stored.
 */
export const nodeAccess = sqliteTable(
    "node_access",
    {
        id: integer("id").primaryKey({ autoIncrement: true }),
        nodeId: text("node_id")
            .notNull()
            .references(() => nodes.id, { onDelete: "cascade" }),
        userId: text("user_id")
            .notNull()
            .references(() => user.id, { onDelete: "cascade" }),
        role: text("role")
            .$type<ArtworkAccessRoleValue>()
            .notNull()
            .default(ArtworkAccessRole.VIEWER),
        sourceType: text("source_type")
            .$type<ArtworkAccessSourceValue>()
            .notNull()
            .default(ArtworkAccessSource.DIRECT),
        sourceId: text("source_id"),
        grantedByUserId: text("granted_by_user_id").references(() => user.id, {
            onDelete: "set null",
        }),
        expiresAt: text("expires_at"),
        grantedAt: text("granted_at")
            .notNull()
            .$defaultFn(() => new Date().toISOString()),
    },
    (table) => [
        uniqueIndex("node_access_unique").on(table.nodeId, table.userId),
        index("idx_node_access_node").on(table.nodeId),
        index("idx_node_access_user").on(table.userId),
        index("idx_node_access_source").on(table.sourceType, table.sourceId),
    ],
);

export type NodeAccess = typeof nodeAccess.$inferSelect;
export type NewNodeAccess = typeof nodeAccess.$inferInsert;

// Legacy alias — code that imports ArtworkAccess / artworkAccess continues to work
export type ArtworkAccess = NodeAccess;
export type NewArtworkAccess = NewNodeAccess;
