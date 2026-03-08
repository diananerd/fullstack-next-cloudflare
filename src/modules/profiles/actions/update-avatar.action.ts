"use server";

import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { requireAuth } from "@/modules/auth/utils/auth-utils";
import {
    member,
    organization,
} from "@/modules/profiles/schemas/org-plugin.schema";
import { deleteFromR2, uploadToR2 } from "@/lib/r2";

export async function updateAvatarAction(orgId: string, formData: FormData) {
    const user = await requireAuth();
    const db = await getDb();

    const [membership] = await db
        .select({ role: member.role })
        .from(member)
        .where(
            and(eq(member.organizationId, orgId), eq(member.userId, user.id)),
        )
        .limit(1);

    if (!membership || !["owner", "admin"].includes(membership.role))
        return { success: false as const, error: "Not authorized." };

    const file = formData.get("avatar") as File | null;
    if (!file || !file.size)
        return { success: false as const, error: "No file provided." };
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
        return { success: false as const, error: "JPEG, PNG or WebP only." };
    if (file.size > 5 * 1024 * 1024)
        return { success: false as const, error: "Max 5 MB." };

    // Delete existing avatar if stored in R2
    const [org] = await db
        .select({ logo: organization.logo })
        .from(organization)
        .where(eq(organization.id, orgId))
        .limit(1);

    if (org?.logo) {
        const oldKey = org.logo.replace(/^.*\/api\/assets\//, "");
        if (oldKey && oldKey !== org.logo) await deleteFromR2(oldKey);
    }

    // Upload: {userId}/avatar.{ext}
    const ext =
        file.type === "image/png"
            ? "png"
            : file.type === "image/webp"
              ? "webp"
              : "jpg";
    const result = await uploadToR2(file, user.id, `avatar.${ext}`);
    if (!result.success)
        return { success: false as const, error: result.error };

    await db
        .update(organization)
        .set({ logo: result.url })
        .where(eq(organization.id, orgId));

    return { success: true as const, url: result.url! };
}
