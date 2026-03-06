import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { commissions } from "@/modules/commissions/schemas/commission.schema";
import {
    MilestoneStatus,
    type MilestoneStatusValue,
} from "@/modules/commissions/models/commission.enum";

export { MilestoneStatus, type MilestoneStatusValue };

export const commissionMilestones = sqliteTable(
    "commission_milestones",
    {
        id: integer("id").primaryKey({ autoIncrement: true }),
        commissionId: text("commission_id")
            .notNull()
            .references(() => commissions.id, { onDelete: "cascade" }),
        title: text("title").notNull(),
        description: text("description"),
        amountCents: integer("amount_cents").notNull(),
        currency: text("currency").notNull().default("usd"),
        dueDate: text("due_date"),
        status: text("status")
            .$type<MilestoneStatusValue>()
            .notNull()
            .default(MilestoneStatus.PENDING),
        sortOrder: integer("sort_order").notNull().default(0),
        submittedAt: text("submitted_at"),
        approvedAt: text("approved_at"),
        releasedAt: text("released_at"),
        deliveryNote: text("delivery_note"),
        createdAt: text("created_at")
            .notNull()
            .$defaultFn(() => new Date().toISOString()),
        updatedAt: text("updated_at")
            .notNull()
            .$defaultFn(() => new Date().toISOString()),
    },
    (table) => [
        index("idx_commission_milestones_commission_id").on(table.commissionId),
        index("idx_commission_milestones_status").on(table.status),
    ],
);

export type CommissionMilestone = typeof commissionMilestones.$inferSelect;
export type NewCommissionMilestone = typeof commissionMilestones.$inferInsert;
