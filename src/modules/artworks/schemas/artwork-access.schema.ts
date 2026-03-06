import {
    index,
    integer,
    sqliteTable,
    text,
    uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { user } from "@/modules/auth/schemas/auth.schema";
import { artworks } from "@/modules/artworks/schemas/artwork.schema";
import {
    ArtworkAccessRole,
    ArtworkAccessSource,
    type ArtworkAccessRoleValue,
    type ArtworkAccessSourceValue,
} from "@/modules/rbac/models/rbac.enum";

// Distinct from artwork_artists (attribution/credits).
// This table governs operational access: who can do what with an artwork.
//
// Effective permissions are resolved at query time:
//   1. Direct grant (sourceType = "direct")          — highest precedence
//   2. Commission grant (sourceType = "commission")
//   3. Collection-inherited grant (sourceType = "collection")
//   4. Org-sourced grant (sourceType = "org")
//   5. Public access (visibility = "public" on artworks table) — implicit, no row needed
//
// When artwork.userId === session.userId → implicit owner, no row required.
// One row per (artworkId, userId) — most-permissive effective role stored.
// App layer recalculates when inherited sources are added/removed.

export const artworkAccess = sqliteTable(
    "artwork_access",
    {
        id: integer("id").primaryKey({ autoIncrement: true }),
        artworkId: integer("artwork_id")
            .notNull()
            .references(() => artworks.id, { onDelete: "cascade" }),
        userId: text("user_id")
            .notNull()
            .references(() => user.id, { onDelete: "cascade" }),
        role: text("role")
            .$type<ArtworkAccessRoleValue>()
            .notNull()
            .default(ArtworkAccessRole.VIEWER),
        // Primary source of this grant (most permissive wins when multiple exist)
        sourceType: text("source_type")
            .$type<ArtworkAccessSourceValue>()
            .notNull()
            .default(ArtworkAccessSource.DIRECT),
        // collectionId (text) or commissionId (text) or organizationId — nullable
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
        // One effective role per (artwork, user) — recalculated on inheritance changes
        uniqueIndex("artwork_access_unique").on(table.artworkId, table.userId),
        index("idx_artwork_access_artwork").on(table.artworkId),
        index("idx_artwork_access_user").on(table.userId),
        index("idx_artwork_access_source").on(table.sourceType, table.sourceId),
    ],
);

export type ArtworkAccess = typeof artworkAccess.$inferSelect;
export type NewArtworkAccess = typeof artworkAccess.$inferInsert;
