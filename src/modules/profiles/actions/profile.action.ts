"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { getDb } from "@/db";
import { getAuthInstance, requireAuth } from "@/modules/auth/utils/auth-utils";
import {
    member,
    organization,
} from "@/modules/profiles/schemas/org-plugin.schema";
import { session as sessionSchema } from "@/modules/auth/schemas/auth.schema";

const SLUG_PATTERN = /^[a-z0-9][a-z0-9\-]{0,48}[a-z0-9]$|^[a-z0-9]{1,2}$/;

export async function createProfileAction(name: string, slug: string) {
    const user = await requireAuth();
    const db = await getDb();

    const trimmedName = name.trim();
    const trimmedSlug = slug.trim().toLowerCase();

    if (!trimmedName || trimmedName.length > 80)
        return { success: false, error: "Name must be 1–80 characters." };

    if (!SLUG_PATTERN.test(trimmedSlug))
        return {
            success: false,
            error: "Handle: lowercase letters, numbers, and hyphens only. Must start and end with a letter or number.",
        };

    // Check slug uniqueness
    const [existing] = await db
        .select({ id: organization.id })
        .from(organization)
        .where(eq(organization.slug, trimmedSlug))
        .limit(1);
    if (existing)
        return { success: false, error: "That handle is already taken." };

    const orgId = crypto.randomUUID();
    await db.insert(organization).values({
        id: orgId,
        name: trimmedName,
        slug: trimmedSlug,
        createdAt: new Date(),
    });

    await db.insert(member).values({
        id: crypto.randomUUID(),
        organizationId: orgId,
        userId: user.id,
        role: "owner",
        createdAt: new Date(),
    });

    // Set as active org in the current session
    const auth = await getAuthInstance();
    const currentSession = await auth.api.getSession({
        headers: await headers(),
    });
    if (currentSession?.session?.id) {
        await db
            .update(sessionSchema)
            .set({ activeOrganizationId: orgId })
            .where(eq(sessionSchema.id, currentSession.session.id));
    }

    return { success: true, slug: trimmedSlug };
}

export async function updateProfileAction(
    orgId: string,
    data: {
        name: string;
        bio: string;
        websiteUrl: string;
        visibility: string;
    },
) {
    const user = await requireAuth();
    const db = await getDb();

    // Verify role
    const [membership] = await db
        .select({ role: member.role })
        .from(member)
        .where(eq(member.organizationId, orgId))
        .limit(1);

    if (!membership || !["owner", "admin"].includes(membership.role)) {
        return { success: false, error: "Not authorized." };
    }

    const name = data.name.trim();
    if (!name || name.length > 80)
        return { success: false, error: "Name must be 1–80 characters." };

    await db
        .update(organization)
        .set({
            name,
            bio: data.bio.trim() || null,
            websiteUrl: data.websiteUrl.trim() || null,
            visibility: data.visibility,
        })
        .where(eq(organization.id, orgId));

    return { success: true };
}
