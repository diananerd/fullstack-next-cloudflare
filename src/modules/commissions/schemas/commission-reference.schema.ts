import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { artworks } from "@/modules/artworks/schemas/artwork.schema";
import { commissions } from "@/modules/commissions/schemas/commission.schema";

export const commissionReferenceArtworks = sqliteTable(
    "commission_reference_artworks",
    {
        id: integer("id").primaryKey({ autoIncrement: true }),
        commissionId: text("commission_id")
            .notNull()
            .references(() => commissions.id, { onDelete: "cascade" }),
        artworkId: integer("artwork_id").references(() => artworks.id, {
            onDelete: "set null",
        }),
        externalUrl: text("external_url"),
        note: text("note"),
        createdAt: text("created_at")
            .notNull()
            .$defaultFn(() => new Date().toISOString()),
    },
    (table) => [
        index("idx_commission_refs_commission_id").on(table.commissionId),
    ],
);

export type CommissionReferenceArtwork =
    typeof commissionReferenceArtworks.$inferSelect;
export type NewCommissionReferenceArtwork =
    typeof commissionReferenceArtworks.$inferInsert;
