import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { user } from "@/modules/auth/schemas/auth.schema";

// Platform credit ledger.
//
// Credits are a prepaid, non-redeemable, non-transferable unit of account.
// They CANNOT be converted back to fiat under any circumstances.
// They represent entitlement to platform services (internal or merchant) only.
//
// Double-entry convention (from the perspective of `userId`):
//   amount > 0 → credits added to userId's balance   (inflow)
//   amount < 0 → credits deducted from userId's balance (outflow)
//
// Merchant model:
//   When userId pays an artist (toUserId), two rows are created:
//     1. userId, amount=-N,  type=ESCROW_HOLD     (consumer debit)
//     2. toUserId, amount=+N, type=ESCROW_RELEASE  (merchant credit, on approval)
//   The commissionId + milestoneId link both rows to the specific work unit.

export const creditTransactions = sqliteTable(
    "credit_transactions",
    {
        id: text("id")
            .primaryKey()
            .$defaultFn(() => crypto.randomUUID()),
        // Primary participant — the user whose balance is affected by this row
        userId: text("user_id")
            .notNull()
            .references(() => user.id, { onDelete: "cascade" }),
        // Counterparty — set for merchant transactions (ESCROW_HOLD/RELEASE)
        toUserId: text("to_user_id").references(() => user.id, {
            onDelete: "set null",
        }),

        // Amount in credits (positive = inflow, negative = outflow)
        amount: integer("amount").notNull(),
        // Running balance snapshot after this transaction for fast auditing
        balanceAfter: integer("balance_after").notNull(),

        // Transaction classification — extended for merchant model
        type: text("type", {
            enum: [
                // Inflows
                "PURCHASE", // Stripe → credits (consumer buys)
                "BONUS", // Platform bonus (welcome, promo, referral)
                "REFUND", // Canceled service → credits returned
                "ESCROW_RELEASE", // Approved milestone → merchant credited
                "ADJUSTMENT", // Admin manual correction
                // Outflows
                "SERVICE_CHARGE", // Internal platform service usage
                "ESCROW_HOLD", // Funds held pending milestone approval
                "ESCROW_CANCEL", // Escrow voided → triggers consumer REFUND row
                "EXPIRY", // Promotional credits expired
            ],
        }).notNull(),

        // What service was charged (for SERVICE_CHARGE rows)
        serviceType: text("service_type"),

        description: text("description").notNull(),

        // Stripe charge ID, job ID, etc. — unique per external reference
        referenceId: text("reference_id").unique(),

        // Commission and milestone linkage — for escrow transactions
        commissionId: text("commission_id"),
        milestoneId: integer("milestone_id"),

        // Arbitrary context data
        metadata: text("metadata", { mode: "json" }),

        createdAt: integer("created_at", { mode: "timestamp_ms" })
            .defaultNow()
            .notNull(),
    },
    (table) => [
        index("idx_credit_tx_user_id").on(table.userId),
        index("idx_credit_tx_to_user").on(table.toUserId),
        index("idx_credit_tx_type").on(table.type),
        index("idx_credit_tx_commission").on(table.commissionId),
    ],
);
