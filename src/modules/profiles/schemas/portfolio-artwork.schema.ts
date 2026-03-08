/**
 * `portfolio_artworks` has been superseded by node_relations type 'features'.
 * profile --[features]--> artwork | collection  (portfolio highlight)
 *
 * This file is kept as a compat stub so existing type imports don't break.
 */
export type PortfolioArtwork = {
    id: number;
    organizationId: string;
    artworkId: string;
    isFeatured: boolean;
    displayOrder: number;
    addedAt: string;
    addedByUserId: string | null;
};
export type NewPortfolioArtwork = Omit<PortfolioArtwork, "id" | "addedAt">;
