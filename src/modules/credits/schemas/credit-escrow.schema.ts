import {
    index,
    integer,
    sqliteTable,
    text,
    uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { user } from "@/modules/auth/schemas/auth.schema";

// Escrow ledger — tracks held credit amounts pending milestone/commission approval.
//
// When a consumer pays for a commission milestone:
//   1. A credit_transactions row (ESCROW_HOLD) debits the consumer's balance
//   2. A credit_escrow row is created with status = "held"
//
// When the milestone is approved:
//   1. escrow row status → "released"
//   2. A credit_transactions row (ESCROW_RELEASE) credits the merchant's balance
//
// When canceled:
//   1. escrow row status → "canceled"
//   2. A credit_transactions row (REFUND) credits back to the consumer
//
// This table is the single source of truth for in-flight escrow balances.
// credit_transactions provides the audit trail.
//
// LEGAL NOTE: credits in escrow are still platform credits — they cannot
// be withdrawn or converted to fiat. Merchants receive credits, not cash.

export const creditEscrow = sqliteTable(
    "credit_escrow",
    {
        id: text("id")
            .primaryKey()
            .$defaultFn(() => crypto.randomUUID()),
        // Consumer whose credits are held
        fromUserId: text("from_user_id")
            .notNull()
            .references(() => user.id, { onDelete: "restrict" }),
        // Merchant (artist) who will receive the credits on release
        toUserId: text("to_user_id")
            .notNull()
            .references(() => user.id, { onDelete: "restrict" }),
        amountCredits: integer("amount_credits").notNull(),
        status: text("status", {
            enum: ["held", "released", "canceled", "disputed"],
        })
            .notNull()
            .default("held"),
        // References — commissionId always set; milestoneId set when milestone-specific
        commissionId: text("commission_id").notNull(),
        milestoneId: integer("milestone_id"),
        // The credit_transactions row that created this escrow
        holdTxId: text("hold_tx_id"),
        // The credit_transactions row that resolved this escrow
        resolveTxId: text("resolve_tx_id"),
        heldAt: text("held_at")
            .notNull()
            .$defaultFn(() => new Date().toISOString()),
        resolvedAt: text("resolved_at"),
    },
    (table) => [
        index("idx_credit_escrow_from").on(table.fromUserId),
        index("idx_credit_escrow_to").on(table.toUserId),
        index("idx_credit_escrow_commission").on(table.commissionId),
        index("idx_credit_escrow_status").on(table.status),
    ],
);

export type CreditEscrow = typeof creditEscrow.$inferSelect;
export type NewCreditEscrow = typeof creditEscrow.$inferInsert;
