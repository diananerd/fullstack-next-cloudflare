import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { user } from "@/modules/auth/schemas/auth.schema";
import { artworks } from "@/modules/artworks/schemas/artwork.schema";
import {
    SnapshotReason,
    type SnapshotReasonValue,
} from "@/modules/artworks/models/artwork-media.enum";

// Immutable point-in-time snapshot of an artwork's state.
// Stores a JSON copy of the artwork row + file manifest at snapshot time.
// Enables versioning, rollback, and audit trail.
//
// Snapshots are append-only — never updated, only created.
// To "restore" a version, the app creates a new snapshot and applies
// the old state to the artwork row.
//
// snapshotData: full serialized artwork + file list at the moment
// previousSnapshotId: forms a linked list of version history

export const artworkSnapshots = sqliteTable(
    "artwork_snapshots",
    {
        id: integer("id").primaryKey({ autoIncrement: true }),
        artworkId: text("artwork_id")
            .notNull()
            .references(() => artworks.id, { onDelete: "cascade" }),
        // Optional link to prior snapshot (singly-linked version chain)
        previousSnapshotId: integer("previous_snapshot_id"),
        reason: text("reason")
            .$type<SnapshotReasonValue>()
            .notNull()
            .default(SnapshotReason.MANUAL),
        // Full artwork state at snapshot time (artwork row + file list)
        snapshotData: text("snapshot_data", { mode: "json" })
            .notNull()
            .$type<Record<string, unknown>>(),
        // Short human-readable label (e.g. "v2 — updated color palette")
        label: text("label"),
        createdByUserId: text("created_by_user_id").references(() => user.id, {
            onDelete: "set null",
        }),
        createdAt: text("created_at")
            .notNull()
            .$defaultFn(() => new Date().toISOString()),
    },
    (table) => [
        index("idx_artwork_snapshots_artwork").on(table.artworkId),
        index("idx_artwork_snapshots_created").on(
            table.artworkId,
            table.createdAt,
        ),
    ],
);

export type ArtworkSnapshot = typeof artworkSnapshots.$inferSelect;
export type NewArtworkSnapshot = typeof artworkSnapshots.$inferInsert;
