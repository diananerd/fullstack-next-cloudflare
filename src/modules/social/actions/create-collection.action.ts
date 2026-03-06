"use server";

import { getDb } from "@/db";
import { requireAuth } from "@/modules/auth/utils/auth-utils";
import {
    AccessSource,
    CollectionRole,
    CollectionVisibility,
    PlacementContext,
} from "@/modules/social/models/collection.enum";
import { collectionMembers } from "@/modules/social/schemas/collection-member.schema";
import { collectionPlacements } from "@/modules/social/schemas/collection-placement.schema";
import { collections } from "@/modules/social/schemas/collection.schema";

/**
 * Allowed characters: Unicode letters (incl. accents), digits, spaces,
 * apostrophe, hyphen, period, comma.
 * Everything else is rejected — no HTML/SQL injection vectors.
 */
const TITLE_PATTERN = /^[\p{L}\p{N}\s'\-\.,]+$/u;

export async function createCollectionAction(rawTitle: string) {
    const user = await requireAuth();

    // Sanitize: trim, collapse internal whitespace
    const title = rawTitle.trim().replace(/\s+/g, " ");

    if (title.length === 0) {
        return { success: false, error: "Name is required." };
    }
    if (title.length > 50) {
        return { success: false, error: "Name must be 50 characters or fewer." };
    }
    if (!TITLE_PATTERN.test(title)) {
        return {
            success: false,
            error: "Only letters, numbers, spaces, and ' - . , are allowed.",
        };
    }

    const db = await getDb();

    const [collection] = await db
        .insert(collections)
        .values({
            title,
            createdByUserId: user.id,
            visibility: CollectionVisibility.PRIVATE,
        })
        .returning({ id: collections.id });

    await db.insert(collectionMembers).values({
        collectionId: collection.id,
        userId: user.id,
        role: CollectionRole.OWNER,
        sourceType: AccessSource.DIRECT,
        grantedByUserId: user.id,
    });

    // Place in the user's workspace so it shows up in /artworks
    await db.insert(collectionPlacements).values({
        collectionId: collection.id,
        contextType: PlacementContext.WORKSPACE,
        contextId: user.id,
    });

    return { success: true, collectionId: collection.id };
}
