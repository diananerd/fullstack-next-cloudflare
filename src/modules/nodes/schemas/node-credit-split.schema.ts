import {
    index,
    integer,
    real,
    sqliteTable,
    text,
    uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { nodes } from "@/modules/nodes/schemas/node.schema";

/**
 * Pre-computed credit/revenue split tree.
 *
 * For any source artwork X, stores the resolved fractional share that each
 * beneficiary profile is owed — accounting for multi-level derivations.
 *
 * Computed by `computeCreditSplits()` whenever the graph around X changes:
 *   - creates / collaborates edge added/removed
 *   - derived_from / remix_of / sample_of / adaptation_of / translation_of edge added/removed
 *
 * Algorithm (BFS, max depth 10):
 *   1. Direct creators of X: each gets (creator.weight × incoming_share)
 *   2. For each derivation edge from X → source_Y (weight = royalty fraction):
 *      recursively distribute (royalty_fraction × incoming_share) through Y's credit tree
 *   3. Remaining share (1 - sum_of_all_derivation_weights) × incoming_share → X's direct creators
 *   4. Accumulate per beneficiary, upsert into this table
 *
 * Example:
 *   Artwork A, derived 30% from B (which has two equal creators C and D):
 *     A_direct_creator → 70%
 *     C (creator of B) → 15%
 *     D (creator of B) → 15%
 *
 * is_locked = 1: manually set splits override computed values (legal agreements, etc.)
 */
export const nodeCreditSplits = sqliteTable(
    "node_credit_splits",
    {
        id: text("id")
            .primaryKey()
            .$defaultFn(() => crypto.randomUUID()),

        // The artwork whose revenue is being split
        sourceNodeId: text("source_node_id")
            .notNull()
            .references(() => nodes.id, { onDelete: "cascade" }),

        // Profile node that receives a share
        beneficiaryId: text("beneficiary_id")
            .notNull()
            .references(() => nodes.id, { onDelete: "cascade" }),

        // Resolved fractional share (0.0 – 1.0). All rows for a given source_node_id sum to 1.0.
        splitPct: real("split_pct").notNull(),

        // How many derivation hops away this beneficiary is (0 = direct creator of sourceNode)
        derivationDepth: integer("derivation_depth").notNull().default(0),

        // JSON array of node IDs representing the derivation path: [sourceNodeId, …, beneficiaryId]
        chain: text("chain", { mode: "json" }).$type<string[]>(),

        // Which relation type justified this split (creates, derived_from, remix_of, etc.)
        basis: text("basis").notNull(),

        // ISO 8601 — when this row was last computed
        computedAt: text("computed_at")
            .notNull()
            .$defaultFn(() => new Date().toISOString()),

        // 1 = manually overridden, skip recomputation
        isLocked: integer("is_locked", { mode: "boolean" })
            .notNull()
            .default(false),

        // When set: this split was locked by a legal CREDIT_SPLIT clause.
        // The contract's clause takes precedence over graph-computed values.
        clauseId: text("clause_id"),
    },
    (table) => [
        uniqueIndex("node_credit_splits_unique").on(
            table.sourceNodeId,
            table.beneficiaryId,
        ),
        index("idx_credit_splits_source").on(table.sourceNodeId),
        index("idx_credit_splits_beneficiary").on(table.beneficiaryId),
    ],
);

export type NodeCreditSplit = typeof nodeCreditSplits.$inferSelect;
export type NewNodeCreditSplit = typeof nodeCreditSplits.$inferInsert;
