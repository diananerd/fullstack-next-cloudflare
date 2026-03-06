import { and, desc, eq, like } from "drizzle-orm";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { artworks } from "@/modules/artworks/schemas/artwork.schema";
import { user as userSchema } from "@/modules/auth/schemas/auth.schema";
import { getSession } from "@/modules/auth/utils/auth-utils";
import { member, organization } from "@/modules/profiles/schemas/org-plugin.schema";

export default async function ProfilePage(props: {
    params: Promise<{ username: string }>;
}) {
    const { username } = await props.params;
    // middleware rewrites /@slug → /profile/slug — username arrives without @
    const slug = username.toLowerCase();
    const db = await getDb();

    // Primary: look up org by slug
    const [org] = await db
        .select()
        .from(organization)
        .where(eq(organization.slug, slug))
        .limit(1);

    // Fallback: user with email prefix (backwards compat before profiles were created)
    const [fallbackUser] = org
        ? [null]
        : await db
              .select()
              .from(userSchema)
              .where(like(userSchema.email, `${slug}@%`))
              .limit(1);

    if (!org && !fallbackUser) notFound();

    // Resolve display name and userId for artwork query
    const displayName = org?.name ?? fallbackUser?.name ?? slug;
    const avatarUrl = org?.logo ?? fallbackUser?.image ?? null;

    // For org: get owner userId to fetch artworks
    let ownerUserId: string | null = null;
    if (org) {
        const [ownerMember] = await db
            .select({ userId: member.userId })
            .from(member)
            .where(and(eq(member.organizationId, org.id), eq(member.role, "owner")))
            .limit(1);
        ownerUserId = ownerMember?.userId ?? null;
    } else {
        ownerUserId = fallbackUser?.id ?? null;
    }

    const userArtworks = ownerUserId
        ? await db
              .select()
              .from(artworks)
              .where(
                  and(
                      eq(artworks.userId, ownerUserId),
                      eq(artworks.visibility, "public"),
                  ),
              )
              .orderBy(desc(artworks.createdAt))
        : [];

    const session = await getSession();
    const bio = org?.bio ?? null;
    const websiteUrl = org?.websiteUrl ?? null;

    return (
        <div className="min-h-screen bg-stone-50 text-stone-900">
            {/* Nav */}
            <header className="px-6 md:px-10 py-5 flex justify-between items-center max-w-5xl mx-auto">
                <Link href="/" className="flex items-center gap-2">
                    {/* biome-ignore lint/performance/noImgElement: brand icon */}
                    <img src="/icon.png" alt="Drimit" className="h-7 w-7" />
                    <span className="font-semibold tracking-tight">Drimit</span>
                </Link>
                {session ? (
                    <Link
                        href="/artworks"
                        className="text-sm text-stone-500 hover:text-stone-900 transition-colors"
                    >
                        My artworks
                    </Link>
                ) : (
                    <Link
                        href="/login"
                        className="text-sm text-stone-500 hover:text-stone-900 transition-colors"
                    >
                        Log in
                    </Link>
                )}
            </header>

            <main className="max-w-5xl mx-auto px-6 md:px-10 py-10">
                {/* Profile header */}
                <div className="flex items-center gap-4 mb-10">
                    {avatarUrl ? (
                        <Image
                            src={avatarUrl}
                            alt={displayName}
                            width={56}
                            height={56}
                            className="rounded-full object-cover"
                        />
                    ) : (
                        <div className="h-14 w-14 rounded-full bg-stone-200 flex items-center justify-center text-stone-500 text-xl font-medium select-none">
                            {displayName.charAt(0).toUpperCase()}
                        </div>
                    )}
                    <div>
                        <h1 className="text-lg font-semibold text-stone-900 leading-tight">
                            {displayName}
                        </h1>
                        <p className="text-sm text-stone-400">@{slug}</p>
                        {bio && (
                            <p className="text-sm text-stone-500 mt-1 max-w-md">{bio}</p>
                        )}
                        {websiteUrl && (
                            <a
                                href={websiteUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-stone-400 hover:text-stone-700 transition-colors mt-0.5 inline-block"
                            >
                                {websiteUrl.replace(/^https?:\/\//, "")}
                            </a>
                        )}
                    </div>
                </div>

                {/* Artworks */}
                {userArtworks.length === 0 ? (
                    <p className="text-sm text-stone-400">No public artworks yet.</p>
                ) : (
                    <div className="columns-2 sm:columns-3 lg:columns-4 gap-3 space-y-3">
                        {userArtworks.map((artwork) => (
                            <div
                                key={artwork.id}
                                className="break-inside-avoid rounded-xl overflow-hidden ring-1 ring-black/[0.07] shadow-[0_2px_12px_rgba(0,0,0,0.10)]"
                            >
                                {/* biome-ignore lint/performance/noImgElement: artwork thumbnail */}
                                <img
                                    src={artwork.url}
                                    alt={artwork.title}
                                    className="w-full object-cover"
                                    loading="lazy"
                                />
                                <div className="px-3 py-2">
                                    <p className="text-xs font-medium text-stone-700 truncate">
                                        {artwork.title}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}
