import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { user } from "@/modules/auth/schemas/auth.schema";
import {
    ProtectionMethod,
    type ProtectionMethodType,
    ProtectionStatus,
    type ProtectionStatusType,
} from "@/modules/artworks/models/artwork.enum";
import {
    ArtworkSemanticType,
    type ArtworkSemanticTypeValue,
} from "@/modules/artworks/models/artwork-media.enum";

/**
 * Unified workspace node.
 *
 * Both artworks and collections are nodes in the same tree.
 * - `kind = 'artwork'` → artwork-specific fields (r2Key, url, protectionStatus…)
 * - `kind = 'collection'` → collection-specific fields (itemCount)
 * - `parentId = null` → lives at workspace root
 * - `parentId = <nodeId>` → nested inside that collection node
 *
 * This replaces:
 *   artworks, collections, collection_items, collection_placements
 */
export const workspaceItems = sqliteTable(
    "workspace_items",
    {
        id: text("id")
            .primaryKey()
            .$defaultFn(() => crypto.randomUUID()),

        userId: text("user_id")
            .notNull()
            .references(() => user.id, { onDelete: "cascade" }),

        // Tree placement — null = workspace root
        parentId: text("parent_id").references(
            (): AnySQLiteColumn => workspaceItems.id,
            { onDelete: "cascade" },
        ),

        kind: text("kind").$type<"artwork" | "collection">().notNull(),

        // ── Shared ────────────────────────────────────────────────────────────
        title: text("title").notNull(),
        description: text("description"),
        visibility: text("visibility").notNull().default("private"),
        position: integer("position").notNull().default(0),
        createdAt: text("created_at")
            .notNull()
            .$defaultFn(() => new Date().toISOString()),
        updatedAt: text("updated_at")
            .notNull()
            .$defaultFn(() => new Date().toISOString()),

        // ── Artwork-specific (null for collections) ───────────────────────────
        r2Key: text("r2_key"),
        url: text("url"),
        width: integer("width"),
        height: integer("height"),
        protectionStatus: text("protection_status")
            .$type<ProtectionStatusType>()
            .default(ProtectionStatus.IDLE),
        jobId: text("job_id"),
        method: text("method")
            .$type<ProtectionMethodType>()
            .default(ProtectionMethod.SHIELD),
        metadata: text("metadata", { mode: "json" }).$type<
            Record<string, unknown>
        >(),
        size: integer("size"),
        semanticType: text("semantic_type")
            .$type<ArtworkSemanticTypeValue>()
            .default(ArtworkSemanticType.DIGITAL_ART),

        // ── Collection-specific (0 for artworks) ─────────────────────────────
        itemCount: integer("item_count").notNull().default(0),
    },
    (table) => [
        index("idx_workspace_items_user_parent").on(
            table.userId,
            table.parentId,
        ),
        index("idx_workspace_items_user_kind").on(table.userId, table.kind),
        index("idx_workspace_items_status").on(table.protectionStatus),
        index("idx_workspace_items_job").on(table.jobId),
        index("idx_workspace_items_created").on(table.createdAt),
    ],
);

// ── Types ─────────────────────────────────────────────────────────────────────

export type WorkspaceItemRow = typeof workspaceItems.$inferSelect;
export type NewWorkspaceItem = typeof workspaceItems.$inferInsert;

// Narrowed helpers — use these in component props
export type ArtworkNode = WorkspaceItemRow & { kind: "artwork" };
export type CollectionNode = WorkspaceItemRow & { kind: "collection" };

// Legacy alias — components that import `Artwork` continue to work
export type Artwork = ArtworkNode;
export type Collection = CollectionNode;

// ── Zod schemas ───────────────────────────────────────────────────────────────

export const insertArtworkSchema = createInsertSchema(workspaceItems, {
    title: z.string().min(1).max(255),
    description: z.string().max(1000).optional(),
    userId: z.string().min(1),
    r2Key: z.string().min(1).optional(),
    url: z.string().url().optional(),
    width: z.number().int().optional(),
    height: z.number().int().optional(),
    size: z.number().int().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
});

export const selectArtworkSchema = createSelectSchema(workspaceItems);

export const updateArtworkSchema = insertArtworkSchema.partial().omit({
    id: true,
    userId: true,
    createdAt: true,
    r2Key: true,
});
