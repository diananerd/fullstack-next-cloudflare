export { artworks } from "@/modules/artworks/schemas/artwork.schema";
export { workspaceItems } from "@/modules/artworks/schemas/workspace-item.schema";
export {
    artworkArtists,
    ArtworkRole,
} from "@/modules/artworks/schemas/artwork-artist.schema";
export { artworkJobs } from "@/modules/artworks/schemas/artwork-job.schema";
export { artworkAccess } from "@/modules/artworks/schemas/artwork-access.schema";
// Multi-file support (replaces single url/r2Key for new uploads)
export { artworkFiles } from "@/modules/artworks/schemas/artwork-file.schema";
// Participation credits — semantic attribution (who was involved, in what role)
// Distinct from: artwork_artists (legacy), artwork_access (permissions), credit_transactions (payment)
export { artworkCredits } from "@/modules/artworks/schemas/artwork-credit.schema";
// Semantic relationships between artworks (derived_from, part_of, references, etc.)
export { artworkRelations } from "@/modules/artworks/schemas/artwork-relation.schema";
// Immutable version snapshots
export { artworkSnapshots } from "@/modules/artworks/schemas/artwork-snapshot.schema";

export {
    account,
    session,
    user,
    verification,
} from "@/modules/auth/schemas/auth.schema";

// Credits — prepaid platform currency (non-redeemable, non-fiat)
export { creditTransactions } from "@/modules/credits/schemas/credit.schema";
export { creditEscrow } from "@/modules/credits/schemas/credit-escrow.schema";

// Profiles
export {
    organization,
    member,
    invitation,
} from "@/modules/profiles/schemas/org-plugin.schema";
export { portfolioArtworks } from "@/modules/profiles/schemas/portfolio-artwork.schema";

// Social — Collections (replaces boards)
export { profileFollows } from "@/modules/social/schemas/profile-follow.schema";
export {
    collections,
    CollectionVisibility,
    MembershipInheritance,
} from "@/modules/social/schemas/collection.schema";
export { collectionMembers } from "@/modules/social/schemas/collection-member.schema";
export { collectionItems } from "@/modules/social/schemas/collection-item.schema";
export { collectionPlacements } from "@/modules/social/schemas/collection-placement.schema";

// Commissions
export {
    commissions,
    CommissionStatus,
} from "@/modules/commissions/schemas/commission.schema";
export {
    commissionMilestones,
    MilestoneStatus,
} from "@/modules/commissions/schemas/commission-milestone.schema";
export {
    commissionPayments,
    PaymentStatus,
} from "@/modules/commissions/schemas/commission-payment.schema";
export { commissionMessages } from "@/modules/commissions/schemas/commission-message.schema";
export { commissionReferenceArtworks } from "@/modules/commissions/schemas/commission-reference.schema";

// RBAC — Configurable permission policies
export { resourceRolePolicies } from "@/modules/rbac/schemas/resource-role-policy.schema";
