import Link from "next/link";
import { Button } from "@/components/ui/button";
import { HelpCircle, ArrowLeft } from "lucide-react";

export default function FAQPage() {
    return (
        <div className="relative min-h-screen flex flex-col items-center overflow-hidden bg-white selection:bg-blue-100">
            
            {/* Background Texture */}
            <div className="absolute inset-0 z-0 pointer-events-none">
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
                <div className="absolute inset-0 bg-[radial-gradient(circle_800px_at_50%_200px,#C9EBFF,transparent)]"></div>
            </div>

            {/* Header */}
            <header className="sticky top-0 z-50 p-6 flex justify-between items-center max-w-5xl mx-auto w-full bg-white/50 backdrop-blur-sm rounded-b-xl border-b border-white/20">
                <div className="flex items-center gap-2">
                     <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                        <img src="/icon.png" alt="Drimit AI Shield" className="h-8 w-8" />
                        <span className="flex items-center gap-2 text-xl">
                            <span className="font-bold text-gray-900">Drimit</span>
                            <span className="font-normal text-blue-500">AI Shield</span>
                        </span>
                     </Link>
                </div>
                <div className="flex gap-4">
                    <Link href="/">
                         <Button variant="ghost" size="sm" className="gap-2">
                            <ArrowLeft className="h-4 w-4" /> Back
                        </Button>
                    </Link>
                </div>
            </header>

            <main className="relative z-10 max-w-3xl mx-auto px-6 py-12 md:py-20 space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
                
                <div className="text-center space-y-4">
                    <div className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700 shadow-sm">
                        <HelpCircle className="mr-2 h-4 w-4" />
                        FAQ
                    </div>
                    <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-gray-900">
                        Common Questions
                    </h1>
                    <p className="text-lg text-gray-500 max-w-xl mx-auto">
                        Everything you need to know about protecting your art with Drimit AI Shield.
                    </p>
                </div>

                <div className="space-y-8">
                    {/* Q1 */}
                    <div className="bg-white/80 backdrop-blur-sm p-8 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                        <h3 className="text-xl font-bold text-gray-900 mb-3">
                            What exactly does Drimit Shield do to my art?
                        </h3>
                        <p className="text-gray-600 leading-relaxed">
                            Think of it as adding an invisible &quot;digital force field&quot; to your image. We inject complex mathematical patterns (noise) that are invisible to the human eye but confusing to AI models. When an AI tries to learn your style or manipulate your image, these patterns cause it to fail and produce chaotic results.
                        </p>
                    </div>

                    {/* Q2 */}
                    <div className="bg-white/80 backdrop-blur-sm p-8 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                        <h3 className="text-xl font-bold text-gray-900 mb-3">
                            Will my art look different?
                        </h3>
                        <p className="text-gray-600 leading-relaxed">
                            To you and your fans, <strong>no</strong>. The changes are imperceptible. Your colors, brushstrokes, and details remain exactly as you created them. The protection only becomes &quot;visible&quot; when an AI model tries to process the file.
                        </p>
                    </div>

                    {/* Q3 */}
                    <div className="bg-white/80 backdrop-blur-sm p-8 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                        <h3 className="text-xl font-bold text-gray-900 mb-3">
                            Is this protection 100% guaranteed?
                        </h3>
                        <p className="text-gray-600 leading-relaxed">
                            Honesty is our policy: No digital security measure is unbreakable forever. However, Drimit Shield makes it <strong>significantly harder, costlier, and more frustrating</strong> for anyone attempting to train AI on your work. It turns what is currently an easy, automated theft into a complex technical problem, deterring the vast majority of scrapers.
                        </p>
                    </div>

                    {/* Q4 */}
                    <div className="bg-white/80 backdrop-blur-sm p-8 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                        <h3 className="text-xl font-bold text-gray-900 mb-3">
                             What AI models does this work against?
                        </h3>
                        <p className="text-gray-600 leading-relaxed">
                            Our proprietary technology is specifically optimized to disrupt the most common generative AI models used for style mimicry, such as Stable Diffusion, LoRA training, and SDEdit.
                        </p>
                    </div>

                     {/* Q5 */}
                     <div className="bg-white/80 backdrop-blur-sm p-8 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                        <h3 className="text-xl font-bold text-gray-900 mb-3">
                            Can I use this for any type of image?
                        </h3>
                        <p className="text-gray-600 leading-relaxed">
                            Yes! It is effective on digital art, illustrations, paintings, and even photography. We currently support standard high-quality formats like PNG and JPEG up to 50MB per file.
                        </p>
                    </div>
                </div>

                {/* Footer CTA */}
                <div className="text-center pt-8 pb-20">
                    <p className="text-gray-500 mb-6">Still have questions? We are here to help.</p>
                    <Link href="/signup">
                        <Button size="lg" className="rounded-full px-8 shadow-blue-200 shadow-lg">
                            Start Protecting Your Art
                        </Button>
                    </Link>
                </div>

            </main>

             <footer className="absolute bottom-6 w-full text-center text-gray-400 text-sm">
                <p>&copy; 2026 Drimit AI Shield. Protecting your Art.</p>
            </footer>
        </div>
    );
}
