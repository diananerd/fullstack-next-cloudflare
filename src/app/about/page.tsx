import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ShieldCheck, ChevronRight } from "lucide-react";

export default function AboutPage() {
    return (
        <div className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden bg-white selection:bg-blue-100">
            
            {/* Background Texture - Grid & Gradient */}
            <div className="absolute inset-0 z-0 pointer-events-none">
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
                <div className="absolute inset-0 bg-[radial-gradient(circle_800px_at_50%_200px,#C9EBFF,transparent)]"></div>
            </div>

            {/* Floating Navigation (Simplified) */}
            <header className="absolute top-0 left-0 right-0 z-50 p-6 flex justify-between items-center max-w-7xl mx-auto w-full">
                <div className="flex items-center gap-2">
                     <img src="/icon.png" alt="Drimit AI Shield" className="h-8 w-8" />
                     <span className="flex items-center gap-2 text-xl">
                        <span className="font-bold text-gray-900">Drimit</span>
                        <span className="font-normal text-blue-500">AI Shield</span>
                     </span>
                </div>
                <div className="flex gap-4">
                    <Link href="/login" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
                        Log In
                    </Link>
                </div>
            </header>

            <main className="relative z-10 max-w-4xl mx-auto px-6 text-center space-y-8 animate-in fade-in zoom-in duration-700 slide-in-from-bottom-4">
                
                {/* Badge */}
                <div className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700 mb-4 shadow-sm">
                    <ShieldCheck className="mr-2 h-4 w-4" />
                    Proprietary Adversarial Tech
                </div>

                {/* Main Heading */}
                <h1 className="text-4xl md:text-6xl lg:text-7xl font-extrabold tracking-tight text-gray-900 leading-[1.1]">
                    Make your Art <br className="hidden md:block"/>
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">
                        impossible to mimic
                    </span> <br className="hidden md:block"/>
                    by AI models.
                </h1>

                {/* Subtitle / Description */}
                <p className="text-lg md:text-xl text-gray-500 max-w-2xl mx-auto leading-relaxed">
                    We use proprietary algorithms to inject <strong>invisible mathematical patterns</strong> into your artworks. This &quot;cloaks&quot; the image, confusing AI models and preventing them from learning your style, ensuring any imitation attempt results in chaotic, unusable outputs.
                </p>

                {/* CTA Buttons */}
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-6">
                    <Link href="/signup">
                        <Button size="lg" className="h-14 pl-20 pr-12 text-lg rounded-full shadow-lg shadow-blue-200 hover:shadow-xl hover:shadow-blue-300 transition-all duration-300 bg-gradient-to-r from-blue-600 to-indigo-600 border-0">
                            Get Started 
                            <ChevronRight className="ml-2 h-5 w-5" />
                        </Button>
                    </Link>
                    <Link href="/faq">
                         <Button variant="outline" size="lg" className="h-14 px-8 text-lg rounded-full border-gray-300 hover:bg-gray-50 text-gray-700">
                            How it Works
                        </Button>
                    </Link>
                </div>
            </main>

            {/* Footer Minimal */}
            <footer className="absolute bottom-6 w-full text-center text-gray-400 text-sm flex flex-col gap-2">
                <div className="flex justify-center gap-4 text-xs font-semibold uppercase tracking-wider text-gray-400">
                    <Link href="/faq" className="hover:text-blue-600 transition-colors">FAQ</Link>
                    <span>•</span>
                    <Link href="/login" className="hover:text-blue-600 transition-colors">Login</Link>
                </div>
                <p>© 2026 Drimit AI Shield. Protecting your Art.</p>
            </footer>
        </div>
    );
}
