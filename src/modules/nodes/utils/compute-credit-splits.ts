"use server";

import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { nodeRelations, nodeCreditSplits } from "@/db/schema";
import { RELATION_TYPES, type RelationType } from "@/constants/relation-types";

const DERIVATION_TYPES: RelationType[] = [
    RELATION_TYPES.DERIVED_FROM,
    RELATION_TYPES.REMIX_OF,
    RELATION_TYPES.SAMPLE_OF,
    RELATION_TYPES.ADAPTATION_OF,
    RELATION_TYPES.TRANSLATION_OF,
];

const CREATION_TYPES: RelationType[] = [
    RELATION_TYPES.CREATES,
    RELATION_TYPES.COLLABORATES,
];

const MAX_DEPTH = 10;

interface CreditAccumulator {
    beneficiaryId: string;
    splitPct: number;
    derivationDepth: number;
    chain: string[];
    basis: string;
}

/**
 * BFS traversal of the credit/derivation graph starting from `sourceNodeId`.
 *
 * Returns a flat map of { beneficiaryId → CreditAccumulator } summing all
 * fractional shares flowing to each profile node.
 *
 * Called internally — use `computeAndStoreCreditSplits` for persistence.
 */
async function traverseCreditTree(
    db: Awaited<ReturnType<typeof getDb>>,
    sourceNodeId: string,
    incomingShare: number,
    depth: number,
    path: string[],
    acc: Map<string, CreditAccumulator>,
): Promise<void> {
    if (depth > MAX_DEPTH || incomingShare < 0.0001) return;

    const currentPath = [...path, sourceNodeId];

    // Load creators of this node
    const creators = await db
        .select({
            toId: nodeRelations.toId,
            type: nodeRelations.type,
            weight: nodeRelations.weight,
        })
        .from(nodeRelations)
        .where(
            and(
                eq(nodeRelations.fromId, sourceNodeId),
                inArray(nodeRelations.type, CREATION_TYPES),
            ),
        );

    // Load derivation edges FROM this node → upstream sources
    const derivations = await db
        .select({
            toId: nodeRelations.toId,
            type: nodeRelations.type,
            weight: nodeRelations.weight,
        })
        .from(nodeRelations)
        .where(
            and(
                eq(nodeRelations.fromId, sourceNodeId),
                inArray(nodeRelations.type, DERIVATION_TYPES),
            ),
        );

    // Total royalty fraction flowing upstream
    const derivationTotal = derivations.reduce(
        (sum, d) => sum + (d.weight ?? 0),
        0,
    );
    const creatorPool = incomingShare * Math.max(0, 1 - derivationTotal);

    // Distribute to direct creators
    if (creators.length > 0) {
        // Normalise weights (default equal split if all NULL)
        const totalWeight = creators.reduce((s, c) => s + (c.weight ?? 1), 0);
        for (const creator of creators) {
            const share = creatorPool * ((creator.weight ?? 1) / totalWeight);
            if (share < 0.0001) continue;
            const existing = acc.get(creator.toId);
            if (existing) {
                existing.splitPct += share;
            } else {
                acc.set(creator.toId, {
                    beneficiaryId: creator.toId,
                    splitPct: share,
                    derivationDepth: depth,
                    chain: [...currentPath, creator.toId],
                    basis: creator.type,
                });
            }
        }
    } else if (creatorPool > 0.0001) {
        // No creators declared — attribute remainder to the node's owner via
        // a sentinel entry using the source node itself as beneficiary proxy.
        // Consumers should resolve this to the actual owning profile.
        const existing = acc.get(sourceNodeId);
        if (existing) {
            existing.splitPct += creatorPool;
        } else {
            acc.set(sourceNodeId, {
                beneficiaryId: sourceNodeId,
                splitPct: creatorPool,
                derivationDepth: depth,
                chain: currentPath,
                basis: RELATION_TYPES.CREATES,
            });
        }
    }

    // Recurse into derivation sources
    for (const deriv of derivations) {
        const upstreamShare = incomingShare * (deriv.weight ?? 0);
        if (upstreamShare < 0.0001) continue;
        // Guard against cycles
        if (currentPath.includes(deriv.toId)) continue;
        await traverseCreditTree(
            db,
            deriv.toId,
            upstreamShare,
            depth + 1,
            currentPath,
            acc,
        );
    }
}

/**
 * Compute and persist credit splits for `sourceNodeId`.
 * Skips rows with `is_locked = 1` (manually overridden).
 *
 * Safe to call on every graph mutation — upserts are idempotent.
 */
export async function computeAndStoreCreditSplits(
    sourceNodeId: string,
): Promise<void> {
    const db = await getDb();

    const acc = new Map<string, CreditAccumulator>();
    await traverseCreditTree(db, sourceNodeId, 1.0, 0, [], acc);

    if (acc.size === 0) return;

    const now = new Date().toISOString();
    const rows = Array.from(acc.values()).map((entry) => ({
        sourceNodeId,
        beneficiaryId: entry.beneficiaryId,
        splitPct: entry.splitPct,
        derivationDepth: entry.derivationDepth,
        chain: entry.chain,
        basis: entry.basis,
        computedAt: now,
        isLocked: false as const,
    }));

    // Delete all non-locked rows for this source, then insert fresh.
    // Simpler than NOT IN and correct — locked rows are preserved.
    await db
        .delete(nodeCreditSplits)
        .where(
            and(
                eq(nodeCreditSplits.sourceNodeId, sourceNodeId),
                eq(nodeCreditSplits.isLocked, false),
            ),
        );

    if (rows.length > 0) {
        await db.insert(nodeCreditSplits).values(rows);
    }
}
