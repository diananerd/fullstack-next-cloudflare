import {
    index,
    integer,
    sqliteTable,
    text,
    uniqueIndex,
} from "drizzle-orm/sqlite-core";
import {
    ResourceType,
    type ResourceTypeValue,
} from "@/modules/rbac/models/rbac.enum";

// Configurable permission matrix per (resource, role).
//
// Resolution order (most specific wins):
//   1. Row WHERE resource_type = X AND resource_id = <specific id>  → per-resource override
//   2. Row WHERE resource_type = X AND resource_id IS NULL          → platform default
//   3. Hardcoded fallback in code (DEFAULT_COLLECTION/ARTWORK_POLICIES)
//
// allowed_actions: JSON string array, e.g. ["view","edit","add_item"]
// Resource owners with the "manage_members" (collection) or "manage_access" (artwork)
// action can insert/update rows for their specific resourceId.
//
// Platform defaults are seeded via migration or admin tooling:
//   INSERT INTO resource_role_policies (resource_type, resource_id, role, allowed_actions)
//   VALUES ('collection', NULL, 'editor', '["view","add_item","remove_item","reorder","edit"]')

export const resourceRolePolicies = sqliteTable(
    "resource_role_policies",
    {
        id: integer("id").primaryKey({ autoIncrement: true }),
        resourceType: text("resource_type")
            .$type<ResourceTypeValue>()
            .notNull(),
        // NULL = platform-wide default for this (resourceType, role) pair
        resourceId: text("resource_id"),
        // Role name — free text to remain forward-compatible with new roles
        role: text("role").notNull(),
        // JSON array of action strings, e.g. '["view","edit","add_item"]'
        allowedActions: text("allowed_actions", { mode: "json" })
            .notNull()
            .$type<string[]>(),
        createdAt: text("created_at")
            .notNull()
            .$defaultFn(() => new Date().toISOString()),
        updatedAt: text("updated_at")
            .notNull()
            .$defaultFn(() => new Date().toISOString()),
    },
    (table) => [
        // One policy row per (resourceType, resourceId, role)
        uniqueIndex("resource_role_policies_unique").on(
            table.resourceType,
            table.resourceId,
            table.role,
        ),
        // Fast lookup: "what policy applies to this resource?"
        index("idx_rrp_resource").on(table.resourceType, table.resourceId),
    ],
);

export type ResourceRolePolicy = typeof resourceRolePolicies.$inferSelect;
export type NewResourceRolePolicy = typeof resourceRolePolicies.$inferInsert;
