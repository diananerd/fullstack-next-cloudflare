import { eq } from "drizzle-orm";
import Link from "next/link";
import { getDb } from "@/db";
import { requireAuth } from "@/modules/auth/utils/auth-utils";
import { getAuthInstance } from "@/modules/auth/utils/auth-utils";
import { headers } from "next/headers";
import {
    member,
    organization,
} from "@/modules/profiles/schemas/org-plugin.schema";
import {
    CreateProfileForm,
    ProfileEditForm,
} from "@/modules/profiles/components/profile-edit-form";

export default async function ProfilePage() {
    const user = await requireAuth();

    // Get active org from session
    const auth = await getAuthInstance();
    const currentSession = await auth.api.getSession({
        headers: await headers(),
    });
    // activeOrganizationId is added by the organization plugin at runtime but not in the base types
    const activeOrgId =
        (currentSession?.session as any)?.activeOrganizationId ?? null;

    const db = await getDb();

    // No active org → show create form
    if (!activeOrgId) {
        return (
            <div className="max-w-2xl mx-auto px-6 py-10">
                <h1 className="text-xl font-semibold text-gray-900 mb-1">
                    Your profile
                </h1>
                <p className="text-sm text-gray-500 mb-8">
                    Create a public profile to share your work.
                </p>
                <CreateProfileForm />
            </div>
        );
    }

    // Fetch org + membership
    const [org] = await db
        .select()
        .from(organization)
        .where(eq(organization.id, activeOrgId))
        .limit(1);

    if (!org) {
        return (
            <div className="max-w-2xl mx-auto px-6 py-10">
                <p className="text-sm text-gray-500">Profile not found.</p>
            </div>
        );
    }

    const [membership] = await db
        .select({ role: member.role })
        .from(member)
        .where(eq(member.organizationId, activeOrgId))
        .limit(1);

    const canEdit = membership && ["owner", "admin"].includes(membership.role);

    return (
        <div className="max-w-2xl mx-auto px-6 py-10">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-xl font-semibold text-gray-900 mb-0.5">
                        Your profile
                    </h1>
                    <Link
                        href={`/@${org.slug}`}
                        className="text-sm text-gray-400 hover:text-gray-700 transition-colors"
                    >
                        @{org.slug} ↗
                    </Link>
                </div>
            </div>

            {canEdit ? (
                <ProfileEditForm org={org} />
            ) : (
                <p className="text-sm text-gray-500">
                    You don't have permission to edit this profile.
                </p>
            )}
        </div>
    );
}
