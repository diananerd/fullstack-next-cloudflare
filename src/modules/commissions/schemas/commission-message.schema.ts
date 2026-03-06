import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { user } from "@/modules/auth/schemas/auth.schema";
import { commissions } from "@/modules/commissions/schemas/commission.schema";

export const commissionMessages = sqliteTable(
    "commission_messages",
    {
        id: integer("id").primaryKey({ autoIncrement: true }),
        commissionId: text("commission_id")
            .notNull()
            .references(() => commissions.id, { onDelete: "cascade" }),
        senderUserId: text("sender_user_id")
            .notNull()
            .references(() => user.id, { onDelete: "restrict" }),
        body: text("body").notNull(),
        attachmentUrl: text("attachment_url"),
        attachmentR2Key: text("attachment_r2_key"),
        isSystem: integer("is_system", { mode: "boolean" })
            .notNull()
            .default(false),
        createdAt: text("created_at")
            .notNull()
            .$defaultFn(() => new Date().toISOString()),
    },
    (table) => [
        index("idx_commission_messages_commission_created").on(
            table.commissionId,
            table.createdAt,
        ),
        index("idx_commission_messages_sender").on(table.senderUserId),
    ],
);

export type CommissionMessage = typeof commissionMessages.$inferSelect;
export type NewCommissionMessage = typeof commissionMessages.$inferInsert;
