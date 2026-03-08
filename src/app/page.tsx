import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getSession } from "@/modules/auth/utils/auth-utils";

/**
 * Seasonal artwork — swap each season.
 * License the image, credit the artist, and update this object.
 * The artwork is the hero of the page.
 */
const SEASONAL_ARTWORK = {
    src: "https://imagedelivery.net/lUOwJskPTk2XKGvtDYvd8w/e26d8bf8-5d25-405a-66f8-6ca414efad00/public",
    alt: "Sleepy cat — Diana Martínez",
    artist: "Diana Martínez",
    username: "diananerd",
    title: "Sleepy Cat",
    artistHref: "",
} satisfies {
    src: string;
    alt: string;
    artist: string;
    username: string;
    title: string;
    artistHref: string;
};

const hasArtwork = SEASONAL_ARTWORK.src !== "";

export default async function HomePage() {
    const session = await getSession();

    return (
        <div className="relative min-h-[100dvh] flex flex-col bg-stone-900 text-white overflow-hidden">
            {/* Seasonal Artwork */}
            {hasArtwork ? (
                <div className="absolute inset-0">
                    {/* biome-ignore lint/performance/noImgElement: full-bleed hero image */}
                    <img
                        src={SEASONAL_ARTWORK.src}
                        alt={SEASONAL_ARTWORK.alt}
                        className="w-full h-full object-cover object-center"
                        style={{
                            animation:
                                "slow-zoom 18s ease-in-out infinite alternate",
                        }}
                    />
                    {/* vignette — stronger at bottom for text legibility over light-toned art */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-black/40" />
                </div>
            ) : (
                /* Placeholder until first artwork is licensed */
                <div className="absolute inset-0 bg-stone-800 flex items-center justify-center">
                    <span className="text-stone-600 text-sm tracking-widest uppercase select-none">
                        Artwork coming soon
                    </span>
                </div>
            )}

            {/* Nav */}
            <header className="relative z-10 px-6 md:px-10 py-5 flex justify-between items-center">
                <Link href="/discover" className="flex items-center gap-2">
                    {/* biome-ignore lint/performance/noImgElement: brand icon */}
                    <img src="/icon.png" alt="Drimit" className="h-7 w-7" />
                    <span className="font-semibold tracking-tight">Drimit</span>
                </Link>
                {session ? (
                    <Link
                        href="/artworks"
                        className="text-sm text-white/60 hover:text-white transition-colors"
                    >
                        My artworks
                    </Link>
                ) : (
                    <Link
                        href="/login"
                        className="text-sm text-white/60 hover:text-white transition-colors"
                    >
                        Log in
                    </Link>
                )}
            </header>

            {/* Slogan — just below nav, visually separated */}
            <div className="relative z-10 px-6 md:px-10 pt-6">
                <p className="text-2xl md:text-3xl font-medium text-white/80 tracking-tight leading-snug max-w-xs">
                    A home for your creative work.
                </p>
            </div>

            {/* Bottom bar — artist credit + CTA */}
            <div className="relative z-10 mt-auto px-6 md:px-10 pb-8 pt-20 flex flex-col sm:flex-row sm:items-end justify-between gap-6">
                {/* Artist credit */}
                <div className="text-left">
                    {hasArtwork && SEASONAL_ARTWORK.artist ? (
                        <>
                            <p className="text-white/40 text-xs tracking-wide mb-0.5">
                                Artwork by
                            </p>
                            {session && SEASONAL_ARTWORK.username ? (
                                <Link
                                    href={`/@${SEASONAL_ARTWORK.username}`}
                                    className="text-white/80 text-sm font-medium hover:text-white transition-colors"
                                >
                                    {SEASONAL_ARTWORK.artist}
                                </Link>
                            ) : SEASONAL_ARTWORK.artistHref ? (
                                <a
                                    href={SEASONAL_ARTWORK.artistHref}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-white/80 text-sm font-medium hover:text-white transition-colors"
                                >
                                    {SEASONAL_ARTWORK.artist}
                                </a>
                            ) : (
                                <p className="text-white/80 text-sm font-medium">
                                    {SEASONAL_ARTWORK.artist}
                                </p>
                            )}
                            {SEASONAL_ARTWORK.title && (
                                <p className="text-white/40 text-xs italic mt-0.5">
                                    "{SEASONAL_ARTWORK.title}"
                                </p>
                            )}
                        </>
                    ) : (
                        <p className="text-white/30 text-xs italic">
                            A space for artists.
                        </p>
                    )}
                </div>

                {/* CTA */}
                <div className="self-end sm:self-auto">
                    <Link href={session ? "/discover" : "/signup"}>
                        <Button className="h-10 px-6 rounded-full bg-white text-stone-900 hover:bg-stone-100 text-sm font-medium border-0 shadow-none">
                            {session ? "Open Drimit" : "Get Started"}
                            <ChevronRight className="ml-1 h-4 w-4" />
                        </Button>
                    </Link>
                </div>
            </div>

            {/* Footer strip */}
            <div className="relative z-10 px-6 md:px-10 pb-5 flex flex-wrap justify-between items-center gap-3 text-xs text-white/25">
                <div className="flex items-center gap-4">
                    <span>© 2026 Drimit</span>
                    <Link
                        href="#"
                        className="hover:text-white/60 transition-colors"
                    >
                        Terms
                    </Link>
                    <Link
                        href="#"
                        className="hover:text-white/60 transition-colors"
                    >
                        Privacy
                    </Link>
                    <Link
                        href="#"
                        className="hover:text-white/60 transition-colors"
                    >
                        Cookies
                    </Link>
                    <Link
                        href="#"
                        className="hover:text-white/60 transition-colors"
                    >
                        Generative AI
                    </Link>
                </div>
            </div>
        </div>
    );
}
