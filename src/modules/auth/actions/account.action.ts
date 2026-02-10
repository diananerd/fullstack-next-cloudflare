"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { eq, count, inArray } from "drizzle-orm";
import { requireAuth } from "@/modules/auth/utils/auth-utils";
import { deleteFromR2, deleteFolderFromR2 } from "@/lib/r2";
import { artworks } from "@/modules/artworks/schemas/artwork.schema";
import {
    user,
    session,
    account,
    verification,
} from "@/modules/auth/schemas/auth.schema";
import { creditTransactions } from "@/modules/credits/schemas/credit.schema";
import { signOut } from "@/modules/auth/actions/auth.action";

export async function deleteAccountAction() {
    const authUser = await requireAuth();
    const userId = authUser.id;
    const db = await getDb();

    console.log(`[DeleteAccount] Starting cleanup for user ${userId}`);

    try {
        // 1. Delete complete User Folder from R2
        // Since we are now using namespaced paths: {userId}/{hash}/...
        // We can simply delete the folder "{userId}"

        console.log(`[DeleteAccount] Deleting R2 folder for user: ${userId}`);
        await deleteFolderFromR2(userId);

        // 2. Delete Data from DB
        // SQLite/Drizzle cascade delete is configured on FKs, but we do it manually to be safe
        // and because some drivers disable FK checks by default.

        // Credits (Cascade on userId)
        await db
            .delete(creditTransactions)
            .where(eq(creditTransactions.userId, userId));

        // Artworks (Cascade on userId)
        // Jobs will cascade from Artworks
        await db.delete(artworks).where(eq(artworks.userId, userId));

        // Auth Tables (Cascade on userId usually)
        await db.delete(session).where(eq(session.userId, userId));
        await db.delete(account).where(eq(account.userId, userId));

        // Verification tokens (linked by email)
        if (authUser.email) {
            await db
                .delete(verification)
                .where(eq(verification.identifier, authUser.email));
        }

        // Finally, User
        await db.delete(user).where(eq(user.id, userId));

        console.log(`[DeleteAccount] Cleanup complete for user ${userId}`);

        // 4. Sign Out
        // Using auth action helper effectively clears cookies
        try {
            await signOut();
        } catch (ignored) {}

        return { success: true };
    } catch (error) {
        console.error(`[DeleteAccount] Failed to delete account:`, error);
        return {
            success: false,
            error: "Failed to delete account. Please try again or contact support.",
        };
    }
}
