import {
    index,
    integer,
    sqliteTable,
    text,
    uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { commissions } from "@/modules/commissions/schemas/commission.schema";
import { commissionMilestones } from "@/modules/commissions/schemas/commission-milestone.schema";
import {
    PaymentStatus,
    type PaymentStatusValue,
} from "@/modules/commissions/models/commission.enum";

export { PaymentStatus, type PaymentStatusValue };

export const commissionPayments = sqliteTable(
    "commission_payments",
    {
        id: text("id")
            .primaryKey()
            .$defaultFn(() => crypto.randomUUID()),
        commissionId: text("commission_id")
            .notNull()
            .references(() => commissions.id, { onDelete: "restrict" }),
        milestoneId: integer("milestone_id").references(
            () => commissionMilestones.id,
            { onDelete: "restrict" },
        ),
        amountCents: integer("amount_cents").notNull(),
        currency: text("currency").notNull().default("usd"),
        status: text("status")
            .$type<PaymentStatusValue>()
            .notNull()
            .default(PaymentStatus.PENDING),
        stripePaymentIntentId: text("stripe_payment_intent_id").unique(),
        stripeTransferId: text("stripe_transfer_id"),
        stripeRefundId: text("stripe_refund_id"),
        heldAt: text("held_at"),
        releasedAt: text("released_at"),
        refundedAt: text("refunded_at"),
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
        index("idx_commission_payments_commission_id").on(table.commissionId),
        index("idx_commission_payments_milestone_id").on(table.milestoneId),
        index("idx_commission_payments_status").on(table.status),
        uniqueIndex("commission_payments_stripe_pi_unique").on(
            table.stripePaymentIntentId,
        ),
    ],
);

export type CommissionPayment = typeof commissionPayments.$inferSelect;
export type NewCommissionPayment = typeof commissionPayments.$inferInsert;
