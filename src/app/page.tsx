import { ChevronRight, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { ProtectionDemo } from "@/components/landing/protection-demo";
import { TypewriterTitle } from "@/components/landing/typewriter-title";
import { Button } from "@/components/ui/button";
import { getSession } from "@/modules/auth/utils/auth-utils";

export default async function HomePage() {
    const session = await getSession();

    return (
        <div className="relative min-h-screen flex flex-col bg-white selection:bg-blue-100">
            {/* Background Texture - Grid & Gradient - Fixed Position so it stays while scrolling */}
            <div className="fixed inset-0 z-0 pointer-events-none">
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
                <div className="absolute inset-0 bg-[radial-gradient(circle_800px_at_50%_200px,#C9EBFF,transparent)]"></div>
            </div>

            {/* Floating Navigation (Simplified) */}
            <header className="absolute top-0 left-0 right-0 z-50 p-4 md:p-6 flex justify-between items-center max-w-7xl mx-auto w-full">
                <div className="flex items-center gap-2">
                    <Link href="/" className="flex items-center gap-2">
                        <img
                            src="/icon.png"
                            alt="Drimit AI Shield"
                            className="h-8 w-8"
                        />
                        <span className="flex items-center gap-2 text-xl">
                            <span className="font-bold text-gray-900">
                                Drimit
                            </span>
                            <span className="font-normal text-blue-500">
                                AI Shield
                            </span>
                        </span>
                    </Link>
                </div>
                <div className="flex gap-4">
                    {session ? (
                        <Link
                            href="/artworks"
                            className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
                        >
                            Artworks
                        </Link>
                    ) : (
                        <Link
                            href="/login"
                            className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
                        >
                            Log In
                        </Link>
                    )}
                </div>
            </header>

            <main className="relative z-10 max-w-7xl mx-auto px-6 pt-20 md:pt-24 pb-20 flex flex-col items-center text-center animate-in fade-in zoom-in duration-700 slide-in-from-bottom-4">
                <div className="max-w-4xl mx-auto space-y-6 mb-10">
                    {/* Badge */}
                    <div className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700 shadow-sm">
                        <ShieldCheck className="mr-2 h-4 w-4" />
                        AI Shield
                    </div>

                    {/* Main Heading */}
                    <TypewriterTitle />

                    {/* Subtitle - Shortened for impact */}
                    <p className="text-lg md:text-xl text-gray-500 max-w-2xl mx-auto leading-relaxed">
                        Add an <strong>invisible protection layer</strong> that
                        confuses AI models without changing how your art looks
                        to humans.
                    </p>
                </div>

                {/* THE DEMO IS THE HERO VISUAL */}
                <div className="w-full relative z-20 mb-10">
                    <ProtectionDemo hasSession={!!session} />
                </div>

                {/* CTA Buttons - The logical next step */}
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4 w-full sm:w-auto">
                    <Link
                        href={session ? "/artworks" : "/signup"}
                        className="w-full sm:w-auto"
                    >
                        <Button
                            size="lg"
                            className="w-full sm:w-auto h-12 md:h-14 px-8 md:pl-20 md:pr-12 text-base md:text-lg rounded-full shadow-lg shadow-blue-200 hover:shadow-xl hover:shadow-blue-300 transition-all duration-300 bg-gradient-to-r from-blue-600 to-indigo-600 border-0"
                        >
                            {session ? "Go to Artworks" : "Get Started"}
                            <ChevronRight className="ml-2 h-5 w-5" />
                        </Button>
                    </Link>
                    <Link href="/faq" className="w-full sm:w-auto">
                        <Button
                            variant="outline"
                            size="lg"
                            className="w-full sm:w-auto h-12 md:h-14 px-8 text-base md:text-lg rounded-full border-gray-300 hover:bg-gray-50 text-gray-700"
                        >
                            How it Works
                        </Button>
                    </Link>
                </div>
            </main>

            {/* Footer Minimal */}
            <footer className="w-full text-center text-gray-400 text-sm flex flex-col gap-2 pb-8 pt-12 relative z-10">
                <div className="flex justify-center gap-4 text-xs font-semibold uppercase tracking-wider text-gray-400">
                    <Link
                        href="/faq"
                        className="hover:text-blue-600 transition-colors"
                    >
                        FAQ
                    </Link>
                    <span>•</span>
                    {session ? (
                        <Link
                            href="/artworks"
                            className="hover:text-blue-600 transition-colors"
                        >
                            Artworks
                        </Link>
                    ) : (
                        <Link
                            href="/login"
                            className="hover:text-blue-600 transition-colors"
                        >
                            Login
                        </Link>
                    )}
                </div>
                <p>© 2026 Drimit AI Shield. Protecting your Art.</p>
            </footer>
        </div>
    );
}
