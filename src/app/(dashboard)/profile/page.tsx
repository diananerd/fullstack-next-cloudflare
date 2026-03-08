import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { getDb } from "@/db";
import { requireAuth, getAuthInstance } from "@/modules/auth/utils/auth-utils";
import {
    member,
    organization,
} from "@/modules/profiles/schemas/org-plugin.schema";

export default async function ProfilePage() {
    const user = await requireAuth();

    const auth = await getAuthInstance();
    const currentSession = await auth.api.getSession({
        headers: await headers(),
    });
    const activeOrgId =
        (currentSession?.session as any)?.activeOrganizationId ?? null;

    if (activeOrgId) {
        const db = await getDb();
        const [org] = await db
            .select({ slug: organization.slug })
            .from(organization)
            .where(eq(organization.id, activeOrgId))
            .limit(1);

        if (org?.slug) redirect(`/@${org.slug}`);
    }

    redirect("/artworks");
}
