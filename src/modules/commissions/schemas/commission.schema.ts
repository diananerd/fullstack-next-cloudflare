import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { user } from "@/modules/auth/schemas/auth.schema";
import { organization } from "@/modules/profiles/schemas/org-plugin.schema";
import {
    CommissionStatus,
    type CommissionStatusValue,
} from "@/modules/commissions/models/commission.enum";

export { CommissionStatus, type CommissionStatusValue };

export const commissions = sqliteTable(
    "commissions",
    {
        id: text("id")
            .primaryKey()
            .$defaultFn(() => crypto.randomUUID()),
        clientUserId: text("client_user_id")
            .notNull()
            .references(() => user.id, { onDelete: "restrict" }),
        artistOrganizationId: text("artist_organization_id")
            .notNull()
            .references(() => organization.id, { onDelete: "restrict" }),
        title: text("title").notNull(),
        description: text("description"),
        status: text("status")
            .$type<CommissionStatusValue>()
            .notNull()
            .default(CommissionStatus.DRAFT),
        budgetMinCents: integer("budget_min_cents"),
        budgetMaxCents: integer("budget_max_cents"),
        currency: text("currency").notNull().default("usd"),
        deadline: text("deadline"),
        canceledByUserId: text("canceled_by_user_id").references(
            () => user.id,
            { onDelete: "set null" },
        ),
        canceledAt: text("canceled_at"),
        completedAt: text("completed_at"),
        // The legal contract governing this commission.
        // Created automatically when a commission moves from draft → negotiating.
        contractId: text("contract_id"),

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
        index("idx_commissions_client_user_id").on(table.clientUserId),
        index("idx_commissions_artist_org_id").on(table.artistOrganizationId),
        index("idx_commissions_status").on(table.status),
        index("idx_commissions_created_at").on(table.createdAt),
    ],
);

export type Commission = typeof commissions.$inferSelect;
export type NewCommission = typeof commissions.$inferInsert;
