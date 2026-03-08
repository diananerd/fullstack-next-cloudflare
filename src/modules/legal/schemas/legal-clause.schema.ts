import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { legalContracts } from "@/modules/legal/schemas/legal-contract.schema";
import { legalContractParties } from "@/modules/legal/schemas/legal-contract-party.schema";
import type { ClauseType } from "@/constants/clause-types";

/**
 * Legal clause — a single typed, executable, negotiable rule within a contract.
 *
 * Each clause has:
 *   - A type  (from CLAUSE_TYPES — no migration for new types)
 *   - A value (type-specific JSON structure — see clause-types.ts for shape)
 *   - A status in the negotiation lifecycle
 *   - Optional open_fields: field names whose values are not yet determined.
 *     A contract with any clause having open_fields cannot become 'active'.
 *
 * Negotiation versioning:
 *   When a party counter-proposes, a NEW clause row is created with
 *   parent_clause_id pointing to the superseded version. The old clause
 *   transitions to status='superseded'. This gives a full history.
 *
 * Execution model:
 *   Each clause type has a corresponding executor in
 *   src/modules/legal/executors/<type>.executor.ts that:
 *     - validate(clause, context) → ValidationResult
 *     - execute(clause, event, context) → Action[]
 *     - render(clause, parties, lang) → string (for document generation)
 *
 * `position` controls ordering in the rendered document.
 */
export const legalClauses = sqliteTable(
    "legal_clauses",
    {
        id: text("id")
            .primaryKey()
            .$defaultFn(() => crypto.randomUUID()),

        contractId: text("contract_id")
            .notNull()
            .references(() => legalContracts.id, { onDelete: "cascade" }),

        type: text("type").$type<ClauseType>().notNull(),

        /** 'proposed' | 'accepted' | 'rejected' | 'open' | 'superseded' */
        status: text("status").notNull().default("proposed"),

        // Which party proposed this clause (null = platform-generated default)
        proposedByPartyId: text("proposed_by_party_id").references(
            () => legalContractParties.id,
            { onDelete: "set null" },
        ),

        // Array of party IDs who have explicitly accepted this clause
        acceptedBy: text("accepted_by", { mode: "json" })
            .$type<string[]>()
            .notNull()
            .default([]),

        // Type-specific parameters (see CLAUSE_TYPES in clause-types.ts)
        value: text("value", { mode: "json" })
            .$type<Record<string, unknown>>()
            .notNull()
            .default({}),

        // Field names whose values are still undetermined.
        // Non-empty = clause is 'open'. Contract cannot activate until empty.
        openFields: text("open_fields", { mode: "json" })
            .$type<string[]>()
            .notNull()
            .default([]),

        // Points to the clause this one supersedes (counter-proposal chain)
        parentClauseId: text("parent_clause_id"),

        // Ordering within the rendered document
        position: integer("position").notNull().default(0),

        // Internal notes (legal annotations, negotiation context — not in document)
        notes: text("notes"),

        createdAt: text("created_at")
            .notNull()
            .$defaultFn(() => new Date().toISOString()),
        updatedAt: text("updated_at")
            .notNull()
            .$defaultFn(() => new Date().toISOString()),
    },
    (table) => [
        index("idx_legal_clauses_contract_status").on(
            table.contractId,
            table.status,
        ),
        index("idx_legal_clauses_contract_type").on(
            table.contractId,
            table.type,
        ),
        index("idx_legal_clauses_parent").on(table.parentClauseId),
    ],
);

export type LegalClause = typeof legalClauses.$inferSelect;
export type NewLegalClause = typeof legalClauses.$inferInsert;
