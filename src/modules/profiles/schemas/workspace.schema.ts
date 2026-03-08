import { index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { organization } from "@/modules/profiles/schemas/org-plugin.schema";

/**
 * A workspace is a scoped container that belongs to an org (better-auth organization).
 * Every entity (artwork, collection, …) optionally belongs to a workspace.
 * workspace_id = null → personal / ungrouped item.
 */
export const workspaces = sqliteTable(
    "workspaces",
    {
        id: text("id")
            .primaryKey()
            .$defaultFn(() => crypto.randomUUID()),
        orgId: text("org_id")
            .notNull()
            .references(() => organization.id, { onDelete: "cascade" }),
        name: text("name").notNull(),
        slug: text("slug"),
        visibility: text("visibility").notNull().default("private"),
        createdAt: text("created_at")
            .notNull()
            .$defaultFn(() => new Date().toISOString()),
        updatedAt: text("updated_at")
            .notNull()
            .$defaultFn(() => new Date().toISOString()),
    },
    (table) => [
        uniqueIndex("workspaces_slug_unique").on(table.slug),
        index("idx_workspaces_org").on(table.orgId),
    ],
);

export type Workspace = typeof workspaces.$inferSelect;
export type NewWorkspace = typeof workspaces.$inferInsert;
