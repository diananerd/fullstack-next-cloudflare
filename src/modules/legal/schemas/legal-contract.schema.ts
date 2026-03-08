import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { user } from "@/modules/auth/schemas/auth.schema";
import { nodes } from "@/modules/nodes/schemas/node.schema";

/**
 * Legal contract — the top-level agreement between parties.
 *
 * A contract is simultaneously:
 *   1. A document  — rendered deterministically from its clauses into PDF/HTML
 *   2. A rule set  — each clause executor enforces platform behaviour
 *   3. A record    — immutable proof of rights and obligations (document_hash)
 *
 * node_id = the rights object the contract governs (nullable for platform-level
 * agreements not tied to a specific work).
 *
 * reference_type + reference_id = polymorphic back-link to the operational
 * entity that generated this contract (e.g. 'commission', 'listing', 'order').
 * Informational only — not a DB-level FK.
 *
 * document_hash = SHA-256 of the final rendered document at signing time.
 * Set once when status transitions to 'active'; never mutated thereafter.
 *
 * governing_law = ISO 3166-1 alpha-2 country code whose copyright statute
 * applies. Determines: moral rights treatement, fair use/dealing, duration,
 * work-for-hire rules. Defaults to 'MX' (company jurisdiction).
 */
export const legalContracts = sqliteTable(
    "legal_contracts",
    {
        id: text("id")
            .primaryKey()
            .$defaultFn(() => crypto.randomUUID()),

        title: text("title").notNull(),

        /** 'commission' | 'license' | 'distribution' | 'collaboration' |
         *  'employment' | 'transfer' | 'platform_terms' */
        type: text("type").notNull(),

        /** 'draft' | 'negotiating' | 'pending_signatures' | 'active' |
         *  'suspended' | 'terminated' | 'expired' */
        status: text("status").notNull().default("draft"),

        // The work this contract governs (null = no specific node, e.g. blanket license)
        nodeId: text("node_id").references(() => nodes.id, {
            onDelete: "set null",
        }),

        // Polymorphic back-link to the operational entity (commission, listing…)
        referenceType: text("reference_type"),
        referenceId: text("reference_id"),

        // ISO 3166-1 alpha-2. Determines applicable copyright law.
        governingLaw: text("governing_law").notNull().default("MX"),

        // Optional specific court or arbitration body
        jurisdiction: text("jurisdiction"),

        // When the contract's obligations take effect / expire
        validFrom: text("valid_from"),
        validUntil: text("valid_until"),

        // ISO 8601 timestamps for lifecycle events
        signedAt: text("signed_at"),
        terminatedAt: text("terminated_at"),
        terminationReason: text("termination_reason"),

        // SHA-256 of the rendered final document — set at signing, immutable
        documentHash: text("document_hash"),

        createdBy: text("created_by")
            .notNull()
            .references(() => user.id, { onDelete: "restrict" }),

        metadata: text("metadata", { mode: "json" }).$type<
            Record<string, unknown>
        >(),

        createdAt: text("created_at")
            .notNull()
            .$defaultFn(() => new Date().toISOString()),
        updatedAt: text("updated_at")
            .notNull()
            .$defaultFn(() => new Date().toISOString()),
    },
    (table) => [
        index("idx_legal_contracts_node_id").on(table.nodeId),
        index("idx_legal_contracts_status").on(table.status),
        index("idx_legal_contracts_type_status").on(table.type, table.status),
        index("idx_legal_contracts_created_by").on(table.createdBy),
        // Polymorphic back-link lookup
        index("idx_legal_contracts_reference").on(
            table.referenceType,
            table.referenceId,
        ),
    ],
);

export type LegalContract = typeof legalContracts.$inferSelect;
export type NewLegalContract = typeof legalContracts.$inferInsert;
