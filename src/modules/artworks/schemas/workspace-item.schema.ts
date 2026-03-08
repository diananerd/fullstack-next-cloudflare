import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { entities } from "@/modules/artworks/schemas/entity.schema";
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
 * Artwork subtype table.
 * Rows exist only for entities with type = 'artwork'.
 * entity_id is the canonical artwork ID used everywhere (URL params, FK refs, etc.).
 *
 * The broader entity metadata (visibility, createdBy, timestamps) lives in `entities`.
 */
export const workspaceItems = sqliteTable(
    "artworks",
    {
        // Primary key: same UUID as entities.id.
        // Named `id` (DB column `id`) to preserve backward compat with all FK constraints.
        id: text("id")
            .primaryKey()
            .references(() => entities.id, { onDelete: "cascade" }),

        title: text("title").notNull(),
        description: text("description"),

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
    },
    (table) => [
        index("idx_artworks_status").on(table.protectionStatus),
        index("idx_artworks_job").on(table.jobId),
    ],
);

// ── Merged entity + subtype view type ────────────────────────────────────────

/**
 * Full artwork record: entity base fields merged with artwork-specific fields.
 * `userId` is an alias for `createdBy` for backward compatibility.
 * `id` is from workspaceItems (= entities.id — same UUID).
 */
export type WorkspaceItemRow = Omit<
    typeof entities.$inferSelect,
    "id" | "type"
> &
    typeof workspaceItems.$inferSelect & {
        /** Alias for createdBy — kept for backward compatibility */
        userId: string;
        /** Always 'artwork' for this merged type */
        kind: "artwork";
    };

export type NewWorkspaceItem = typeof workspaceItems.$inferInsert & {
    createdBy: string;
    visibility?: string;
    workspaceId?: string | null;
};

// Narrowed helpers
export type ArtworkNode = WorkspaceItemRow;
export type CollectionNode = {
    kind: "collection";
    id: string;
    userId: string;
    createdBy: string;
    workspaceId: string | null;
    visibility: string;
    createdAt: string;
    updatedAt: string;
    title: string;
    description: string | null;
    coverImageUrl: string | null;
    itemCount: number;
};

// Legacy aliases
export type Artwork = ArtworkNode;
export type Collection = CollectionNode;

// ── Zod schemas ───────────────────────────────────────────────────────────────

export const insertArtworkSchema = createInsertSchema(workspaceItems, {
    title: z.string().min(1).max(255),
    description: z.string().max(1000).optional(),
    r2Key: z.string().min(1).optional(),
    url: z.string().url().optional(),
    width: z.number().int().optional(),
    height: z.number().int().optional(),
    size: z.number().int().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
}).extend({
    createdBy: z.string().min(1),
    visibility: z.string().optional(),
    workspaceId: z.string().nullable().optional(),
    // Legacy field accepted for backward compat but maps to createdBy
    userId: z.string().min(1).optional(),
    parentId: z.string().nullable().optional(),
});

export const selectArtworkSchema = createSelectSchema(workspaceItems);

export const updateArtworkSchema = insertArtworkSchema.partial().omit({
    id: true,
    createdBy: true,
});
