import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { user } from "@/modules/auth/schemas/auth.schema";
import { sql } from "drizzle-orm";

export const creditTransactions = sqliteTable("credit_transactions", {
    id: text("id")
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
        .notNull()
        .references(() => user.id, { onDelete: "cascade" }),

    // Amount can be positive (deposit) or negative (usage)
    amount: integer("amount").notNull(),

    // Calculate balance after transaction for faster auditing/debugging
    balanceAfter: integer("balance_after").notNull(),

    // Classification
    type: text("type", {
        enum: ["DEPOSIT", "USAGE", "REFUND", "BONUS", "ADJUSTMENT"],
    }).notNull(),

    description: text("description").notNull(),

    // Store IDs like 'stripe_charge_xu123' or 'job_abc123'
    referenceId: text("reference_id").unique(),

    // Store arbitrary data
    metadata: text("metadata", { mode: "json" }),

    createdAt: integer("created_at", { mode: "timestamp_ms" })
        .defaultNow()
        .notNull(),
});
