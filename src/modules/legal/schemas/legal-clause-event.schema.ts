import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { legalClauses } from "@/modules/legal/schemas/legal-clause.schema";
import { legalContractParties } from "@/modules/legal/schemas/legal-contract-party.schema";

/**
 * Audit trail for clause negotiation events.
 *
 * Every action on a clause is recorded here — immutable append-only log.
 * Used for: dispute resolution, legal audit, UI negotiation timeline.
 *
 * Events:
 *   proposed         — clause first submitted by a party
 *   accepted         — party accepted the clause as-is
 *   rejected         — party rejected the clause
 *   counter_proposed — party submitted a new clause superseding this one
 *   field_set        — an open field was resolved (payload: {field, value})
 *   note_added       — internal note appended
 *   executed         — platform executed this clause in response to an event
 *                      (payload: {trigger_event, actions_taken})
 */
export const legalClauseEvents = sqliteTable(
    "legal_clause_events",
    {
        id: text("id")
            .primaryKey()
            .$defaultFn(() => crypto.randomUUID()),

        clauseId: text("clause_id")
            .notNull()
            .references(() => legalClauses.id, { onDelete: "cascade" }),

        // The party who triggered this event (null = platform-automated)
        partyId: text("party_id").references(() => legalContractParties.id, {
            onDelete: "set null",
        }),

        /** 'proposed' | 'accepted' | 'rejected' | 'counter_proposed' |
         *  'field_set' | 'note_added' | 'executed' */
        event: text("event").notNull(),

        // Event-specific data
        payload: text("payload", { mode: "json" }).$type<
            Record<string, unknown>
        >(),

        createdAt: text("created_at")
            .notNull()
            .$defaultFn(() => new Date().toISOString()),
    },
    (table) => [
        index("idx_legal_clause_events_clause").on(table.clauseId),
        index("idx_legal_clause_events_party").on(table.partyId),
    ],
);

export type LegalClauseEvent = typeof legalClauseEvents.$inferSelect;
export type NewLegalClauseEvent = typeof legalClauseEvents.$inferInsert;
