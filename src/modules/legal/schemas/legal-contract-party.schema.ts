import { index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { user } from "@/modules/auth/schemas/auth.schema";
import { nodes } from "@/modules/nodes/schemas/node.schema";
import { legalContracts } from "@/modules/legal/schemas/legal-contract.schema";

/**
 * Party to a legal contract.
 *
 * Two-layer identity per party:
 *   profile_id → nodes.id (type='profile')  — the public actor
 *   user_id    → user.id                    — the legal/billing anchor
 *
 * A party signs as their profile (public identity) but legal liability and
 * billing are anchored to the user account (physical/legal person).
 *
 * Roles reflect creative industry conventions:
 *   author          — the natural person who created the work (may differ from rights_holder)
 *   rights_holder   — entity owning the economic rights (may be an org, employer, heir)
 *   licensor        — party granting the license
 *   licensee        — party receiving the license
 *   commissioner    — client who funded / requested the work
 *   artist          — service provider in a commission context
 *   distributor     — entity with distribution rights
 *   sublicensee     — downstream recipient of sublicensed rights
 *   guarantor       — third party guaranteeing obligations
 *   platform        — Drimit itself (for platform-level terms)
 *
 * signed_at = null means this party has not yet signed.
 * All required parties must have signed_at set before contract → active.
 */
export const legalContractParties = sqliteTable(
    "legal_contract_parties",
    {
        id: text("id")
            .primaryKey()
            .$defaultFn(() => crypto.randomUUID()),

        contractId: text("contract_id")
            .notNull()
            .references(() => legalContracts.id, { onDelete: "cascade" }),

        // Public actor (profile node)
        profileId: text("profile_id")
            .notNull()
            .references(() => nodes.id, { onDelete: "restrict" }),

        // Legal/billing anchor
        userId: text("user_id")
            .notNull()
            .references(() => user.id, { onDelete: "restrict" }),

        /** 'author' | 'rights_holder' | 'licensor' | 'licensee' | 'commissioner' |
         *  'artist' | 'distributor' | 'sublicensee' | 'guarantor' | 'platform' */
        role: text("role").notNull(),

        // Null = not yet signed
        signedAt: text("signed_at"),

        // Reference to an e-signature provider record or internal hash
        signatureRef: text("signature_ref"),

        createdAt: text("created_at")
            .notNull()
            .$defaultFn(() => new Date().toISOString()),
    },
    (table) => [
        // A profile holds at most one role per contract
        uniqueIndex("legal_contract_parties_unique").on(
            table.contractId,
            table.profileId,
            table.role,
        ),
        index("idx_legal_contract_parties_contract").on(table.contractId),
        index("idx_legal_contract_parties_profile").on(table.profileId),
        index("idx_legal_contract_parties_user").on(table.userId),
    ],
);

export type LegalContractParty = typeof legalContractParties.$inferSelect;
export type NewLegalContractParty = typeof legalContractParties.$inferInsert;
