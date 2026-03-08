import {
    index,
    integer,
    sqliteTable,
    text,
    uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { user } from "@/modules/auth/schemas/auth.schema";
import { entities } from "@/modules/artworks/schemas/entity.schema";
import { organization } from "@/modules/profiles/schemas/org-plugin.schema";

export const portfolioArtworks = sqliteTable(
    "portfolio_artworks",
    {
        id: integer("id").primaryKey({ autoIncrement: true }),
        organizationId: text("organization_id")
            .notNull()
            .references(() => organization.id, { onDelete: "cascade" }),
        artworkId: text("artwork_id")
            .notNull()
            .references(() => entities.id, { onDelete: "cascade" }),
        isFeatured: integer("is_featured", { mode: "boolean" })
            .notNull()
            .default(false),
        displayOrder: integer("display_order").notNull().default(0),
        addedAt: text("added_at")
            .notNull()
            .$defaultFn(() => new Date().toISOString()),
        addedByUserId: text("added_by_user_id").references(() => user.id, {
            onDelete: "set null",
        }),
    },
    (table) => [
        uniqueIndex("portfolio_artworks_org_artwork_unique").on(
            table.organizationId,
            table.artworkId,
        ),
        index("idx_portfolio_artworks_org_featured").on(
            table.organizationId,
            table.isFeatured,
        ),
        index("idx_portfolio_artworks_artwork_id").on(table.artworkId),
    ],
);

export type PortfolioArtwork = typeof portfolioArtworks.$inferSelect;
export type NewPortfolioArtwork = typeof portfolioArtworks.$inferInsert;
