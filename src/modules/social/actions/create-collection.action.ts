"use server";

import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { requireAuth } from "@/modules/auth/utils/auth-utils";
import { nodes } from "@/modules/nodes/schemas/node.schema";
import { nodeRelations } from "@/modules/nodes/schemas/node-relation.schema";
import { collectionNodes } from "@/modules/artworks/schemas/collection-node.schema";
import { RELATION_TYPES } from "@/constants/relation-types";
import { member } from "@/modules/profiles/schemas/org-plugin.schema";

/**
 * Allowed characters: Unicode letters (incl. accents), digits, spaces,
 * apostrophe, hyphen, period, comma.
 * Everything else is rejected — no HTML/SQL injection vectors.
 */
const TITLE_PATTERN = /^[\p{L}\p{N}\s'\-\.,]+$/u;

export async function createCollectionAction(
    rawTitle: string,
    parentCollectionId?: string | null,
) {
    const user = await requireAuth();

    const title = rawTitle.trim().replace(/\s+/g, " ");

    if (title.length === 0) {
        return { success: false, error: "Name is required." };
    }
    if (title.length > 50) {
        return {
            success: false,
            error: "Name must be 50 characters or fewer.",
        };
    }
    if (!TITLE_PATTERN.test(title)) {
        return {
            success: false,
            error: "Only letters, numbers, spaces, and ' - . , are allowed.",
        };
    }

    const db = await getDb();

    // Resolve the user's active profile (first org membership found)
    const [membership] = await db
        .select({ organizationId: member.organizationId })
        .from(member)
        .where(eq(member.userId, user.id))
        .limit(1);

    const collectionId = crypto.randomUUID();

    // 1. Create base node
    await db.insert(nodes).values({
        id: collectionId,
        type: "collection",
        createdBy: user.id,
        visibility: "private",
    });

    // 2. Create collection subtype
    await db.insert(collectionNodes).values({
        id: collectionId,
        name: title,
    });

    // 3. Link to parent collection via CONTAINS edge (if nested)
    if (parentCollectionId) {
        await db.insert(nodeRelations).values({
            fromId: parentCollectionId,
            toId: collectionId,
            type: RELATION_TYPES.CONTAINS,
            createdBy: user.id,
        });
    }

    // 4. If user has a profile, mark as curated by them
    if (membership) {
        // profile_nodes.id === organization.id === node.id
        await db
            .insert(nodeRelations)
            .values({
                fromId: membership.organizationId,
                toId: collectionId,
                type: RELATION_TYPES.CURATES,
                createdBy: user.id,
            })
            .onConflictDoNothing();
    }

    return { success: true, collectionId };
}
