"use client";

import { useState, useRef, useEffect } from "react";
import { MoveHorizontal, Eye, Bot } from "lucide-react";

export function ComparisonSlider() {
    const [sliderPosition, setSliderPosition] = useState(50);
    const [isDragging, setIsDragging] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const handleMove = (clientX: number) => {
        if (containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
            const percentage = (x / rect.width) * 100;
            setSliderPosition(percentage);
        }
    };

    const onMouseMove = (e: React.MouseEvent) => {
        if (!isDragging) return;
        handleMove(e.clientX);
    };

    const onTouchMove = (e: React.TouchEvent) => {
        if (!isDragging) return;
        handleMove(e.touches[0].clientX);
    };

    // Allow clicking to jump
    const onClick = (e: React.MouseEvent) => {
        handleMove(e.clientX);
    };

    return (
        <div className="w-full max-w-4xl mx-auto py-12 px-4">
            <div className="text-center mb-8">
                <h2 className="text-3xl font-bold text-gray-900 mb-2">See What the AI Sees</h2>
                <p className="text-gray-500">Drag the slider to compare Human Vision vs. AI Vision</p>
            </div>

            <div 
                className="relative w-full aspect-[16/10] md:aspect-[21/9] rounded-2xl overflow-hidden shadow-2xl cursor-ew-resize select-none border-4 border-white ring-1 ring-gray-200"
                ref={containerRef}
                onMouseMove={onMouseMove}
                onTouchMove={onTouchMove}
                onMouseDown={() => setIsDragging(true)}
                onTouchStart={() => setIsDragging(true)}
                onMouseUp={() => setIsDragging(false)}
                onTouchEnd={() => setIsDragging(false)}
                onMouseLeave={() => setIsDragging(false)}
                onClick={onClick}
            >
                {/* 1. LAYER: HUMAN VISION (Underneath) */}
                <div className="absolute inset-0 bg-gray-100 flex items-center justify-center">
                    {/* Placeholder Art - Replace with real artwork */}
                    <img 
                        src="https://images.unsplash.com/photo-1579783902614-a3fb39279c0f?q=80&w=2000&auto=format&fit=crop" 
                        alt="Human Vision" 
                        className="absolute inset-0 w-full h-full object-cover"
                        draggable={false}
                    />
                    <div className="absolute top-6 left-6 bg-white/90 backdrop-blur px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-sm font-bold text-gray-900 z-10 pointer-events-none">
                        <Eye className="w-4 h-4 text-blue-600" />
                        Human Vision (Protected)
                    </div>
                </div>

                {/* 2. LAYER: AI VISION (Overlay) */}
                <div 
                    className="absolute inset-0 overflow-hidden"
                    style={{ clipPath: `inset(0 ${100 - sliderPosition}% 0 0)` }}
                >
                    <div className="absolute inset-0 bg-gray-900">
                        {/* 
                           TRICK: We use the SAME image but apply heavy CSS filters to simulate 
                           what the "Protection" does to the AI model (Noise/Chaos).
                           In a real demo, you'd upload a second image that is actually the 'protected' noise layer.
                        */}
                        <img 
                            src="https://images.unsplash.com/photo-1579783902614-a3fb39279c0f?q=80&w=2000&auto=format&fit=crop" 
                            alt="AI Vision" 
                            className="absolute inset-0 w-full h-full object-cover opacity-80 mix-blend-hard-light filter contrast-[2.0] brightness-50 hue-rotate-90 invert"
                            draggable={false}
                        />
                        {/* Overlaying digital noise SVG or texture */}
                         <div className="absolute inset-0 opacity-40 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] bg-repeat brightness-200"></div>
                         
                         <div className="absolute top-6 right-6 bg-black/80 backdrop-blur px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-sm font-bold text-white z-10 pointer-events-none border border-white/20">
                            <Bot className="w-4 h-4 text-red-400" />
                            AI Vision (Confused)
                        </div>
                    </div>
                </div>

                {/* 3. SLIDER HANDLE */}
                <div 
                    className="absolute top-0 bottom-0 w-1 bg-white cursor-col-resize z-20 shadow-[0_0_20px_rgba(0,0,0,0.5)] flex items-center justify-center scroll-smooth"
                    style={{ left: `${sliderPosition}%` }}
                >
                    <div className="w-10 h-10 bg-white rounded-full shadow-lg flex items-center justify-center border-2 border-gray-100 transform active:scale-95 transition-transform">
                        <MoveHorizontal className="w-5 h-5 text-gray-600" />
                    </div>
                </div>
            </div>
            
            <p className="text-center text-xs text-gray-400 mt-4 italic">
                *Simulated representation. The actual file remains high-quality for humans, but mathematically chaotic for models.
            </p>
        </div>
    );
}
