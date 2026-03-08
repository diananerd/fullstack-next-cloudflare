import { and, eq } from "drizzle-orm";
import Image from "next/image";
import Link from "next/link";
import { getDb } from "@/db";
import { getCurrentUser } from "@/modules/auth/utils/auth-utils";
import {
    member,
    organization,
} from "@/modules/profiles/schemas/org-plugin.schema";
import { NavigationUserMenu } from "./navigation-user-menu";

export async function Navigation() {
    const user = await getCurrentUser();

    let profileSlug: string | undefined;
    if (user) {
        const db = await getDb();
        const [org] = await db
            .select({ slug: organization.slug })
            .from(organization)
            .innerJoin(
                member,
                and(
                    eq(member.organizationId, organization.id),
                    eq(member.userId, user.id),
                    eq(member.role, "owner"),
                ),
            )
            .limit(1);
        profileSlug = org?.slug;
    }

    return (
        <nav className="border-b bg-white sticky top-0 z-50">
            <div className="w-full px-4 md:px-6 py-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-6">
                        <Link href="/" className="flex items-center gap-2">
                            <Image
                                src="/icon.png"
                                alt="Drimit"
                                width={32}
                                height={32}
                                className="h-8 w-8"
                                unoptimized
                            />
                            <span className="flex items-center gap-2 text-xl">
                                <span className="font-bold text-gray-900">
                                    Drimit
                                </span>
                            </span>
                        </Link>
                        <Link
                            href="/discover"
                            className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
                        >
                            Discover
                        </Link>
                    </div>
                    <div className="flex items-center gap-4">
                        {user && <NavigationUserMenu user={user} profileSlug={profileSlug} />}
                    </div>
                </div>
            </div>
        </nav>
    );
}
