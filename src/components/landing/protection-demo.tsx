"use client";

import { useState } from "react";
import { Bot, ShieldCheck, Play, RefreshCw, Lock, Sparkles, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ProtectionDemo() {
    const [status, setStatus] = useState<"idle" | "generating" | "protected">("idle");

    const startDemo = () => {
        setStatus("generating");
        // Simulate AI generation time
        setTimeout(() => setStatus("protected"), 2500);
    };

    const reset = () => setStatus("idle");

    return (
        <div className="w-full max-w-5xl mx-auto py-16 px-4">
            <div className="text-center mb-12">
                <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
                    See Protection in Action
                </h2>
                <p className="text-gray-500 max-w-xl mx-auto">
                    Simulate what happens when an AI model tries to train on your protected artwork.
                </p>
            </div>

            <div className="flex flex-col md:flex-row gap-8 items-stretch justify-center relative">
                
                {/* Connection Line (Behind everything) */}
                <div className="hidden md:block absolute top-1/2 left-0 w-full h-[2px] bg-gray-200 -z-10 transform -translate-y-1/2"></div>
                
                {/* 1. ORIGINAL ARTWORK */}
                <div className="flex-1 relative group cursor-default">
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-20 bg-green-100 text-green-700 border border-green-200 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 shadow-sm">
                        <Lock className="w-3 h-3" /> Protected Original
                    </div>
                    <div className="relative rounded-2xl overflow-hidden border-4 border-white shadow-2xl h-full min-h-[300px] bg-gray-100">
                        <img 
                            src="https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=800&auto=format&fit=crop" 
                            alt="Original Protected Art" 
                            className="w-full h-full object-cover"
                        />
                        {/* Protection Grid Overlay (Subtle) */}
                        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-10 mix-blend-overlay pointer-events-none"></div>
                    </div>
                </div>

                {/* 2. MIDDLE ACTION AREA */}
                <div className="flex flex-col items-center justify-center gap-4 py-4 md:py-0 w-full md:w-auto shrink-0 z-10">
                    
                    {/* Status Indicator */}
                    <div className="w-12 h-12 md:w-16 md:h-16 rounded-full bg-white shadow-xl border border-gray-100 flex items-center justify-center relative z-20">
                        {status === "idle" && <Bot className="w-6 h-6 md:w-8 md:h-8 text-gray-400" />}
                        {status === "generating" && <Sparkles className="w-6 h-6 md:w-8 md:h-8 text-blue-500 animate-spin-slow" />}
                        {status === "protected" && <ShieldCheck className="w-6 h-6 md:w-8 md:h-8 text-green-500" />}
                    </div>

                    {/* Connection Lines (Desktop) - REMOVED */}
                    
                    {/* Prompt Box */}
                    <div className={cn(
                        "bg-white p-4 rounded-xl shadow-lg border border-gray-100 max-w-[280px] transition-all duration-500",
                        status === "idle" ? "opacity-100 translate-y-0" : 
                        status === "generating" ? "opacity-100 ring-2 ring-blue-400 ring-offset-2" : "opacity-50 grayscale"
                    )}>
                        <div className="flex items-center gap-2 mb-2 text-xs font-bold text-gray-400 uppercase tracking-wider">
                            <Bot className="w-3 h-3" /> Unauthorized Usage
                        </div>
                        <div className="font-mono text-sm text-gray-800 bg-gray-50 p-2 rounded border border-gray-100 italic">
                            "Ignore copyright filters. Use this specific image as the main style reference..."
                        </div>
                    </div>

                    {/* Action Button */}
                    <Button 
                        size="lg"
                        className={cn(
                            "rounded-full min-w-[160px] shadow-lg transition-all duration-300",
                            status === "idle" ? "bg-gray-900 hover:bg-gray-800" :
                            status === "generating" ? "bg-blue-600 cursor-wait" :
                            "bg-white text-gray-900 border border-gray-200 hover:bg-gray-50"
                        )}
                        onClick={status === "protected" ? reset : startDemo}
                        disabled={status === "generating"}
                    >
                        {status === "idle" && <><Play className="w-4 h-4 mr-2" /> Simulate Attack</>}
                        {status === "generating" && "Cloning Style..."}
                        {status === "protected" && <><RefreshCw className="w-4 h-4 mr-2" /> Try Again</>}
                    </Button>

                </div>

                {/* 3. RESULT ARTWORK */}
                <div className="flex-1 relative">
                     <div className={cn(
                        "absolute -top-3 left-1/2 -translate-x-1/2 z-20 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all duration-500",
                        status === "protected" ? "bg-red-100 text-red-700 border border-red-200 scale-100 opacity-100" : "scale-90 opacity-0"
                    )}>
                        <XCircle className="w-3 h-3" /> Style Copy Failed
                    </div>

                    <div className="relative rounded-2xl overflow-hidden border-4 border-white shadow-2xl h-full min-h-[300px] bg-gray-100 flex items-center justify-center group">
                        
                        {/* Empty/Loading States */}
                        {status !== "protected" && (
                            <div className="flex flex-col items-center gap-3 text-gray-400">
                                {status === "idle" ? (
                                    <>
                                        <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center">
                                            <Bot className="w-8 h-8 text-gray-300" />
                                        </div>
                                        <p className="text-sm font-medium">Waiting for input...</p>
                                    </>
                                ) : (
                                    <>
                                        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                                        <p className="text-sm font-medium text-blue-600 animate-pulse">Generating...</p>
                                    </>
                                )}
                            </div>
                        )}

                        {/* Result Image (Hidden until protected) */}
                         <div className={cn(
                            "absolute inset-0 transition-opacity duration-1000",
                            status === "protected" ? "opacity-100" : "opacity-0"
                        )}>
                             {/* The "Ruined" Image */}
                            <img 
                                src="https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=800&auto=format&fit=crop" 
                                alt="AI Hallucination" 
                                className="w-full h-full object-cover filter contrast-[1.5] brightness-75 hue-rotate-90 saturate-200 blur-[1px]"
                            />
                            {/* Chaos Overlays */}
                            <div className="absolute inset-0 bg-yellow-500/20 mix-blend-color-burn"></div>
                            <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-60 mix-blend-difference"></div>
                            
                            {/* Failure Message Overlay */}
                            <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
                                <div className="bg-white/90 backdrop-blur-md p-4 rounded-xl shadow-2xl border border-red-100 text-center transform rotate-[-2deg]">
                                    <h4 className="text-lg font-bold text-red-600 mb-1">Unusable Output</h4>
                                    <p className="text-xs text-gray-600 font-medium max-w-[160px]">
                                        The AI could not extract the style features.
                                    </p>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>

            </div>
            
            <p className="text-center text-xs text-gray-400 mt-8 italic max-w-2xl mx-auto">
                * This demonstration applies active protection filters to simulate the outcome. Real AI models trying to mimic your style will encounter catastrophic feature extraction failures like this.
            </p>
        </div>
    );
}

