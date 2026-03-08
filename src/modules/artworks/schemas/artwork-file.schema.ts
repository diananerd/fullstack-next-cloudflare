import {
    index,
    integer,
    sqliteTable,
    text,
    uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { user } from "@/modules/auth/schemas/auth.schema";
import { entities } from "@/modules/artworks/schemas/entity.schema";
import {
    ArtworkFileRole,
    MediaFormat,
    type ArtworkFileRoleValue,
    type MediaFormatValue,
} from "@/modules/artworks/models/artwork-media.enum";

// Each row is one file belonging to an artwork.
// An artwork always has exactly one PRIMARY file (enforced at app layer).
// All other roles (preview, protected, variant, attachment, source, export)
// can have any cardinality.
//
// Storage convention:
//   {userId}/{sha256}/{role}/{filename}
//   e.g. {userId}/{sha256}/primary/original.png
//        {userId}/{sha256}/protected/protected.png
//        {userId}/{sha256}/preview/thumb.webp
//        {userId}/{sha256}/attachment/textures.zip
//
// CF Images / CF Stream readiness:
//   cfImageId / cfStreamId are optional fields populated when a file is
//   offloaded to Cloudflare Images or Cloudflare Stream. When set, the
//   serving pipeline uses those IDs for optimized delivery instead of R2.

export const artworkFiles = sqliteTable(
    "artwork_files",
    {
        id: integer("id").primaryKey({ autoIncrement: true }),
        artworkId: text("artwork_id")
            .notNull()
            .references(() => entities.id, { onDelete: "cascade" }),
        role: text("role")
            .$type<ArtworkFileRoleValue>()
            .notNull()
            .default(ArtworkFileRole.PRIMARY),
        format: text("format")
            .$type<MediaFormatValue>()
            .notNull()
            .default(MediaFormat.IMAGE),
        // R2 object key — always set
        r2Key: text("r2_key").notNull(),
        // Public-facing URL (via /api/assets proxy or direct R2 public URL)
        url: text("url").notNull(),
        filename: text("filename"),
        mimeType: text("mime_type"),
        sizeBytes: integer("size_bytes"),
        width: integer("width"),
        height: integer("height"),
        durationMs: integer("duration_ms"), // audio/video
        // Cloudflare Images ID — populated when offloaded (future)
        cfImageId: text("cf_image_id"),
        // Cloudflare Stream UID — populated when offloaded (future)
        cfStreamId: text("cf_stream_id"),
        // SHA-256 hash of the file content — for dedup and integrity
        sha256: text("sha256"),
        uploadedByUserId: text("uploaded_by_user_id").references(
            () => user.id,
            { onDelete: "set null" },
        ),
        createdAt: text("created_at")
            .notNull()
            .$defaultFn(() => new Date().toISOString()),
    },
    (table) => [
        index("idx_artwork_files_artwork_id").on(table.artworkId),
        index("idx_artwork_files_role").on(table.artworkId, table.role),
        uniqueIndex("artwork_files_r2_key_unique").on(table.r2Key),
    ],
);

export type ArtworkFile = typeof artworkFiles.$inferSelect;
export type NewArtworkFile = typeof artworkFiles.$inferInsert;
