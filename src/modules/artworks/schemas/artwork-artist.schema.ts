import {
    index,
    integer,
    sqliteTable,
    text,
    unique,
} from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { user } from "@/modules/auth/schemas/auth.schema";
import { artworks } from "./artwork.schema";

/**
 * Known roles for the artwork↔artist relationship.
 * Stored as plain text in DB — new roles can be added without a migration.
 * Add here for type safety and discoverability.
 */
export const ArtworkRole = {
    /** Primary author / creator of the work */
    CREATOR: "creator",
    /** Contributed to the work alongside other creators */
    COLLABORATOR: "collaborator",
    /** Commissioned or funded the work */
    COMMISSIONER: "commissioner",
    /** Person depicted or represented in the work */
    SUBJECT: "subject",
    /** Curated or selected the work (e.g. gallery, collection) */
    CURATOR: "curator",
} as const;

export type ArtworkRoleType =
    | (typeof ArtworkRole)[keyof typeof ArtworkRole]
    | (string & {});

/**
 * Many-to-many junction between artworks and users.
 *
 * Supports any combination:
 *   - One artwork, many artists with different roles
 *   - One artist, many artworks with different roles
 *   - Same artist, same artwork, different roles (e.g. creator + subject of a self-portrait)
 *
 * The `userId` on `artworks` (owner/uploader) is a separate operational concern
 * (R2 paths, billing, auth) and does NOT need to be replicated here.
 * Use this table for the semantic artist↔artwork relationship.
 */
export const artworkArtists = sqliteTable(
    "artwork_artists",
    {
        id: integer("id").primaryKey({ autoIncrement: true }),
        artworkId: integer("artwork_id")
            .notNull()
            .references(() => artworks.id, { onDelete: "cascade" }),
        userId: text("user_id")
            .notNull()
            .references(() => user.id, { onDelete: "cascade" }),
        /** Semantic role of this artist in relation to this artwork */
        role: text("role").notNull().default(ArtworkRole.CREATOR),
        /** Optional free-text note about the contribution */
        note: text("note"),
        addedAt: text("added_at")
            .notNull()
            .$defaultFn(() => new Date().toISOString()),
    },
    (table) => [
        // A person can have the same role only once per artwork
        unique("uq_artwork_artist_role").on(
            table.artworkId,
            table.userId,
            table.role,
        ),
        index("idx_artwork_artists_artwork_id").on(table.artworkId),
        index("idx_artwork_artists_user_id").on(table.userId),
        index("idx_artwork_artists_role").on(table.role),
    ],
);

export const insertArtworkArtistSchema = createInsertSchema(artworkArtists, {
    artworkId: z.number().int().positive(),
    userId: z.string().min(1),
    role: z.string().min(1).max(64),
    note: z.string().max(500).optional(),
});

export const selectArtworkArtistSchema = createSelectSchema(artworkArtists);

export type ArtworkArtist = typeof artworkArtists.$inferSelect;
export type NewArtworkArtist = typeof artworkArtists.$inferInsert;
