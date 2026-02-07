import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import {
    ProtectionStatus,
    type ProtectionStatusType,
} from "@/modules/artworks/models/artwork.enum";
import { user } from "@/modules/auth/schemas/auth.schema";

export const artworks = sqliteTable(
    "artworks",
    {
        id: integer("id").primaryKey({ autoIncrement: true }),
        title: text("title").notNull(),
        description: text("description"),
        userId: text("user_id")
            .notNull()
            .references(() => user.id, { onDelete: "cascade" }),
        r2Key: text("r2_key").notNull(),
        url: text("url").notNull(),
        protectedUrl: text("protected_url"),
        protectedR2Key: text("protected_r2_key"),
        protectionStatus: text("protection_status")
            .$type<ProtectionStatusType>()
            .notNull()
            .default(ProtectionStatus.PENDING),
        width: integer("width"),
        height: integer("height"),
        size: integer("size"),
        createdAt: text("created_at")
            .notNull()
            .$defaultFn(() => new Date().toISOString()),
        updatedAt: text("updated_at")
            .notNull()
            .$defaultFn(() => new Date().toISOString()),
    },
    (table) => [
        index("idx_artworks_user_id").on(table.userId),
        index("idx_artworks_created_at").on(table.createdAt),
        index("idx_artworks_status").on(table.protectionStatus),
    ],
);

// Zod schemas for validation
export const insertArtworkSchema = createInsertSchema(artworks, {
    title: z.string().min(1, "Title is required").max(255, "Title is too long"),
    description: z.string().max(1000, "Description is too long").optional(),
    userId: z.string().min(1, "User ID is required"),
    r2Key: z.string().min(1, "R2 Key is required"),
    url: z.string().url("Invalid URL"),
    protectedUrl: z.string().url().optional(),
    protectedR2Key: z.string().optional(),
    protectionStatus: z
        .enum(Object.values(ProtectionStatus) as [string, ...string[]])
        .optional(),
    width: z.number().int().optional(),
    height: z.number().int().optional(),
    size: z.number().int().optional(),
});

export const selectArtworkSchema = createSelectSchema(artworks);

export const updateArtworkSchema = insertArtworkSchema.partial().omit({
    id: true,
    userId: true,
    createdAt: true,
    r2Key: true, // Typically shouldn't change the file key on update
});

export type Artwork = typeof artworks.$inferSelect;
export type NewArtwork = typeof artworks.$inferInsert;
