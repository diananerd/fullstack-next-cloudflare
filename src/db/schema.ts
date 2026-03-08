// ── Universal graph core ──────────────────────────────────────────────────────
export { nodes } from "@/modules/nodes/schemas/node.schema";
export { nodeRelations } from "@/modules/nodes/schemas/node-relation.schema";
export { nodeAccess } from "@/modules/nodes/schemas/node-access.schema";

// ── Node subtypes ─────────────────────────────────────────────────────────────
// Artwork (table: artworks)
export { workspaceItems } from "@/modules/artworks/schemas/workspace-item.schema";
export {
    artworks,
    insertArtworkSchema,
    selectArtworkSchema,
    updateArtworkSchema,
} from "@/modules/artworks/schemas/artwork.schema";
// Collection
export { collectionNodes } from "@/modules/artworks/schemas/collection-node.schema";
// Profile (1:1 with better-auth organization)
export { profileNodes } from "@/modules/profiles/schemas/profile-node.schema";

// ── Compat re-exports (keep old names working) ────────────────────────────────
export { entities } from "@/modules/artworks/schemas/entity.schema";
export { entityRelations } from "@/modules/artworks/schemas/entity-relation.schema";
export { artworkRelations } from "@/modules/artworks/schemas/artwork-relation.schema";
export { artworkAccess } from "@/modules/artworks/schemas/artwork-access.schema";

// ── Workspace scoping ─────────────────────────────────────────────────────────
export { workspaces } from "@/modules/profiles/schemas/workspace.schema";

// ── Satellite operational tables ─────────────────────────────────────────────
export { artworkJobs } from "@/modules/artworks/schemas/artwork-job.schema";
export { artworkFiles } from "@/modules/artworks/schemas/artwork-file.schema";
export { artworkCredits } from "@/modules/artworks/schemas/artwork-credit.schema";
export { artworkSnapshots } from "@/modules/artworks/schemas/artwork-snapshot.schema";

// ── Auth (better-auth) ────────────────────────────────────────────────────────
export {
    account,
    session,
    user,
    verification,
} from "@/modules/auth/schemas/auth.schema";

// ── Credits — prepaid platform currency ──────────────────────────────────────
export { creditTransactions } from "@/modules/credits/schemas/credit.schema";
export { creditEscrow } from "@/modules/credits/schemas/credit-escrow.schema";

// ── Profiles (better-auth org plugin) ────────────────────────────────────────
export {
    organization,
    member,
    invitation,
} from "@/modules/profiles/schemas/org-plugin.schema";

// ── Commissions ───────────────────────────────────────────────────────────────
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

// ── RBAC ──────────────────────────────────────────────────────────────────────
export { resourceRolePolicies } from "@/modules/rbac/schemas/resource-role-policy.schema";
