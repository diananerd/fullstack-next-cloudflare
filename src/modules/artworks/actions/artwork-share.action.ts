"use server";

import { and, eq, getTableColumns, like, ne, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { artworkAccess, user } from "@/db/schema";
import { entities } from "@/modules/artworks/schemas/entity.schema";
import { workspaceItems as artworkData } from "@/modules/artworks/schemas/workspace-item.schema";
import { requireAuth } from "@/modules/auth/utils/auth-utils";

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function assertOwner(artworkId: string, userId: string) {
    const db = await getDb();
    const [row] = await db
        .select({ createdBy: entities.createdBy })
        .from(entities)
        .where(eq(entities.id, artworkId))
        .limit(1);
    if (!row) return null;
    if (row.createdBy !== userId) return null;
    return row;
}

// ─── Actions ─────────────────────────────────────────────────────────────────

export async function getArtworkShareDataAction(artworkId: string) {
    try {
        const currentUser = await requireAuth();
        const db = await getDb();

        const [artwork] = await db
            .select({
                createdBy: entities.createdBy,
                title: artworkData.title,
                visibility: entities.visibility,
            })
            .from(entities)
            .innerJoin(artworkData, eq(artworkData.id, entities.id))
            .where(eq(entities.id, artworkId))
            .limit(1);

        if (!artwork || artwork.createdBy !== currentUser.id)
            return { success: false as const, error: "Unauthorized" };

        const accessList = await db
            .select({
                id: artworkAccess.id,
                userId: artworkAccess.userId,
                role: artworkAccess.role,
                grantedAt: artworkAccess.grantedAt,
                userName: user.name,
                userEmail: user.email,
                userImage: user.image,
            })
            .from(artworkAccess)
            .leftJoin(user, eq(artworkAccess.userId, user.id))
            .where(eq(artworkAccess.artworkId, artworkId));

        return {
            success: true as const,
            title: artwork.title,
            visibility: artwork.visibility ?? "private",
            ownerId: artwork.createdBy,
            accessList,
        };
    } catch {
        return { success: false as const, error: "Server error" };
    }
}

export async function updateArtworkDetailsAction(
    artworkId: string,
    data: { title?: string; description?: string },
) {
    try {
        const currentUser = await requireAuth();
        if (!(await assertOwner(artworkId, currentUser.id)))
            return { success: false as const, error: "Unauthorized" };

        const db = await getDb();
        const now = new Date().toISOString();

        const artworkSet: Record<string, unknown> = {};
        if (data.title !== undefined) artworkSet.title = data.title;
        if (data.description !== undefined)
            artworkSet.description = data.description;

        if (Object.keys(artworkSet).length > 0) {
            await db
                .update(artworkData)
                .set(artworkSet as any)
                .where(eq(artworkData.id, artworkId));
        }

        await db
            .update(entities)
            .set({ updatedAt: now })
            .where(eq(entities.id, artworkId));

        revalidatePath("/artworks");
        return { success: true as const };
    } catch {
        return { success: false as const, error: "Server error" };
    }
}

export async function updateArtworkVisibilityAction(
    artworkId: string,
    visibility: "private" | "public" | "unlisted",
) {
    try {
        const currentUser = await requireAuth();
        if (!(await assertOwner(artworkId, currentUser.id)))
            return { success: false as const, error: "Unauthorized" };

        const db = await getDb();
        await db
            .update(entities)
            .set({ visibility, updatedAt: new Date().toISOString() })
            .where(eq(entities.id, artworkId));

        revalidatePath("/artworks");
        return { success: true as const };
    } catch {
        return { success: false as const, error: "Server error" };
    }
}

export async function searchUsersForShareAction(
    artworkId: string,
    query: string,
) {
    try {
        const currentUser = await requireAuth();
        if (!query || query.trim().length < 2)
            return { success: true as const, users: [] };

        const db = await getDb();
        const [entity] = await db
            .select({ createdBy: entities.createdBy })
            .from(entities)
            .where(eq(entities.id, artworkId))
            .limit(1);

        if (!entity || entity.createdBy !== currentUser.id)
            return { success: false as const, error: "Unauthorized" };

        const q = `%${query.trim()}%`;
        const results = await db
            .select({
                id: user.id,
                name: user.name,
                email: user.email,
                image: user.image,
            })
            .from(user)
            .where(
                and(
                    ne(user.id, entity.createdBy),
                    or(like(user.name, q), like(user.email, q)),
                ),
            )
            .limit(6);

        return { success: true as const, users: results };
    } catch {
        return { success: false as const, error: "Server error" };
    }
}

export async function addArtworkAccessAction(
    artworkId: string,
    targetUserId: string,
    role: string,
) {
    try {
        const currentUser = await requireAuth();
        if (!(await assertOwner(artworkId, currentUser.id)))
            return { success: false as const, error: "Unauthorized" };

        const db = await getDb();
        await db
            .insert(artworkAccess)
            .values({
                artworkId,
                userId: targetUserId,
                role: role as any,
                sourceType: "direct",
                grantedByUserId: currentUser.id,
                grantedAt: new Date().toISOString(),
            })
            .onConflictDoUpdate({
                target: [artworkAccess.artworkId, artworkAccess.userId],
                set: { role: role as any },
            });

        return { success: true as const };
    } catch {
        return { success: false as const, error: "Server error" };
    }
}

export async function removeArtworkAccessAction(
    artworkId: string,
    targetUserId: string,
) {
    try {
        const currentUser = await requireAuth();
        if (!(await assertOwner(artworkId, currentUser.id)))
            return { success: false as const, error: "Unauthorized" };

        const db = await getDb();
        await db
            .delete(artworkAccess)
            .where(
                and(
                    eq(artworkAccess.artworkId, artworkId),
                    eq(artworkAccess.userId, targetUserId),
                ),
            );

        return { success: true as const };
    } catch {
        return { success: false as const, error: "Server error" };
    }
}
