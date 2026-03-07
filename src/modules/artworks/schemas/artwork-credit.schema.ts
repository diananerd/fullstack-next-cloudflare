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
    ArtworkCreditRole,
    type ArtworkCreditRoleValue,
} from "@/modules/artworks/models/artwork-media.enum";

// Semantic participation credits — "who was involved and in what capacity".
//
// Distinct from:
//   - artwork_access (artwork_access.ts) — operational permissions (who can do what)
//   - credit_transactions — platform payment credits (currency substitute)
//
// Multiple credits per (artwork, user) are allowed with DIFFERENT roles
// (e.g. director + composer of the same film).
// Display order controls how credits appear publicly.

export const artworkCredits = sqliteTable(
    "artwork_credits",
    {
        id: integer("id").primaryKey({ autoIncrement: true }),
        artworkId: text("artwork_id")
            .notNull()
            .references(() => artworks.id, { onDelete: "cascade" }),
        // userId is nullable: allows crediting external people not on the platform
        userId: text("user_id").references(() => user.id, {
            onDelete: "set null",
        }),
        // For external/non-platform credits
        externalName: text("external_name"),
        externalUrl: text("external_url"),
        role: text("role")
            .$type<ArtworkCreditRoleValue>()
            .notNull()
            .default(ArtworkCreditRole.COLLABORATOR),
        // Optional free-text note (e.g. "voice of character X")
        note: text("note"),
        // Controls display order in credits block
        displayOrder: integer("display_order").notNull().default(0),
        // Whether this credit is publicly visible
        isPublic: integer("is_public", { mode: "boolean" })
            .notNull()
            .default(true),
        addedAt: text("added_at")
            .notNull()
            .$defaultFn(() => new Date().toISOString()),
    },
    (table) => [
        // Same user can have the same role only once per artwork
        uniqueIndex("artwork_credits_user_role_unique").on(
            table.artworkId,
            table.userId,
            table.role,
        ),
        index("idx_artwork_credits_artwork").on(table.artworkId),
        index("idx_artwork_credits_user").on(table.userId),
    ],
);

export type ArtworkCredit = typeof artworkCredits.$inferSelect;
export type NewArtworkCredit = typeof artworkCredits.$inferInsert;
