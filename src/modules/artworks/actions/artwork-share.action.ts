"use server";

import { and, eq, like, ne, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { artworkAccess, artworks, user } from "@/db/schema";
import { requireAuth } from "@/modules/auth/utils/auth-utils";

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function assertOwner(artworkId: number, userId: string) {
    const db = await getDb();
    const row = await db
        .select({ userId: artworks.userId })
        .from(artworks)
        .where(eq(artworks.id, artworkId))
        .get();
    if (!row) return null;
    if (row.userId !== userId) return null;
    return row;
}

// ─── Actions ─────────────────────────────────────────────────────────────────

export async function getArtworkShareDataAction(artworkId: number) {
    try {
        const currentUser = await requireAuth();
        const db = await getDb();

        const artwork = await db
            .select({
                userId: artworks.userId,
                title: artworks.title,
                visibility: artworks.visibility,
            })
            .from(artworks)
            .where(eq(artworks.id, artworkId))
            .get();

        if (!artwork || artwork.userId !== currentUser.id)
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
            ownerId: artwork.userId,
            accessList,
        };
    } catch {
        return { success: false as const, error: "Server error" };
    }
}

export async function updateArtworkDetailsAction(
    artworkId: number,
    data: { title?: string; description?: string },
) {
    try {
        const currentUser = await requireAuth();
        if (!(await assertOwner(artworkId, currentUser.id)))
            return { success: false as const, error: "Unauthorized" };

        const db = await getDb();
        const set: Record<string, unknown> = {
            updatedAt: new Date().toISOString(),
        };
        if (data.title !== undefined) set.title = data.title;
        if (data.description !== undefined) set.description = data.description;

        await db
            .update(artworks)
            .set(set as any)
            .where(eq(artworks.id, artworkId));

        revalidatePath("/artworks");
        return { success: true as const };
    } catch {
        return { success: false as const, error: "Server error" };
    }
}

export async function updateArtworkVisibilityAction(
    artworkId: number,
    visibility: "private" | "public" | "unlisted",
) {
    try {
        const currentUser = await requireAuth();
        if (!(await assertOwner(artworkId, currentUser.id)))
            return { success: false as const, error: "Unauthorized" };

        const db = await getDb();
        await db
            .update(artworks)
            .set({ visibility, updatedAt: new Date().toISOString() })
            .where(eq(artworks.id, artworkId));

        revalidatePath("/artworks");
        return { success: true as const };
    } catch {
        return { success: false as const, error: "Server error" };
    }
}

export async function searchUsersForShareAction(
    artworkId: number,
    query: string,
) {
    try {
        const currentUser = await requireAuth();
        if (!query || query.trim().length < 2)
            return { success: true as const, users: [] };

        const db = await getDb();
        const artwork = await db
            .select({ userId: artworks.userId })
            .from(artworks)
            .where(eq(artworks.id, artworkId))
            .get();

        if (!artwork || artwork.userId !== currentUser.id)
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
                    ne(user.id, artwork.userId),
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
    artworkId: number,
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
    artworkId: number,
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
