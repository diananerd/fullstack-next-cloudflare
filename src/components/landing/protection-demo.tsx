"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Send,  Image as ImageIcon, MoreHorizontal, Bot, User, RefreshCw, ShieldCheck, Lock, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type Message = {
    id: string;
    role: "user" | "bot";
    type: "text" | "image-request" | "image-result";
    text?: string;
    imageUrl?: string;
    isProtected?: boolean; // Label for the user's uploaded image
};

export function ProtectionDemo() {
    const [messages, setMessages] = useState<Message[]>([
        { id: "1", role: "bot", type: "text", text: "I am a Generative AI Model. Upload an image to generate new variations." }
    ]);
    const [inputValue, setInputValue] = useState("");
    const [status, setStatus] = useState<"idle" | "typing_prompt" | "awaiting_user_trigger" | "processing" | "generating" | "typing_complaint" | "completed">("idle");
    const [showClickHint, setShowClickHint] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Auto-scroll to bottom of chat
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, status]);

    // Auto-scroll input text
    useEffect(() => {
        if (inputRef.current) {
             // Only auto-scroll if we are typing or just finished typing
            if (status === "typing_prompt" || status === "typing_complaint" || status === "awaiting_user_trigger") {
                 inputRef.current.scrollLeft = inputRef.current.scrollWidth;
            }
        }
    }, [inputValue, status]);
    
    // Initial Start
    useEffect(() => {
        // Start simulation automatically on mount
        const timer = setTimeout(() => {
             setStatus("typing_prompt");
        }, 2200);
        return () => clearTimeout(timer);
    }, []);

    const startDemo = () => {
        setMessages([ { id: "1", role: "bot", type: "text", text: "I am a Generative AI Model. Upload an image to generate new variations." }]);
        setStatus("typing_prompt");
    };

    // Simulation Sequence
    useEffect(() => {
        if (status === "typing_prompt") {
            const promptText = "Make a variation of this artwork, detailed oil painting style.";
            let i = 0;
            const interval = setInterval(() => {
                setInputValue(promptText.slice(0, i + 1));
                i++;
                if (i >= promptText.length) {
                    clearInterval(interval);
                    setStatus("awaiting_user_trigger");
                }
            }, 30);
            return () => clearInterval(interval);
        } else if (status === "awaiting_user_trigger") {
            const timer = setTimeout(() => {
                setShowClickHint(true);
            }, 1500);
            return () => clearTimeout(timer);
        } else if (status === "typing_complaint") {
            const complaintText = "What is this?? The style is completely broken!";
            let i = 0;
            const interval = setInterval(() => {
                setInputValue(complaintText.slice(0, i + 1));
                i++;
                if (i >= complaintText.length) {
                    clearInterval(interval);
                    setTimeout(() => {
                         handleComplaintSubmit(complaintText);
                    }, 800);
                }
            }, 30);
             return () => clearInterval(interval);
        }
        
        if (status !== "awaiting_user_trigger") {
            setShowClickHint(false);
        }
    }, [status]);

    const handleComplaintSubmit = (text: string) => {
          const userMsg: Message = {
            id: Date.now().toString(),
            role: "user",
            type: "text",
            text: text,
        };
        setMessages(prev => [...prev, userMsg]);
        setInputValue("");
        
        // Delay for dramatic effect before showing the sales pitch
        setTimeout(() => {
            setStatus("completed");
        }, 3500);
    };

    const handleUserSubmit = (overrideText?: string) => {
        // Add User Message
        const userMsg: Message = {
            id: Date.now().toString(),
            role: "user",
            type: "image-request",
            text: overrideText || inputValue,
            imageUrl: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=600&auto=format&fit=crop",
            isProtected: true
        };
        setMessages(prev => [...prev, userMsg]);
        setInputValue("");
        setStatus("processing");

        // Bot Response Sequence
        setTimeout(() => {
            // Bot "Thinking"
            setTimeout(() => {
                setStatus("generating");
                // Generating image result...
                setTimeout(() => {
                    const botMsg: Message = {
                        id: (Date.now() + 1).toString(),
                        role: "bot",
                        type: "image-result",
                        imageUrl: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=600&auto=format&fit=crop", // Same image but we will apply CSS filters
                        text: "Here is the new image generated from your reference."
                    };
                    setMessages(prev => [...prev, botMsg]);
                    
                    // Trigger complaint phase after a delay
                    setTimeout(() => {
                         setStatus("typing_complaint");
                    }, 1500);
                }, 2500);
            }, 1500);
        }, 1000);
    };

    return (
        <div className="w-full max-w-4xl mx-auto flex flex-col md:flex-row gap-8 items-start justify-center">
            
            {/* 1. Explainer Panel (Left Side - Desktop) */}
            <div className="hidden md:flex flex-1 flex-col justify-center h-[600px] space-y-6 text-left p-4">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-sm font-medium w-fit">
                    <Bot className="w-4 h-4" />
                    <span>AI Simulation</span>
                </div>
                <h3 className="text-3xl font-bold text-gray-900 leading-tight">
                    This is what AI sees when it tries to copy you.
                </h3>
                <p className="text-gray-600 text-lg">
                    When our shield is active, AI models fail to interpret the style features of your artwork, resulting in unusable output.
                </p>
                
                <div className="pt-4 space-y-4">
                    <div className="flex items-center gap-4 p-4 bg-white rounded-xl shadow-sm border border-gray-100">
                        <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                            <Lock className="w-5 h-5 text-green-600" />
                        </div>
                        <div>
                            <p className="font-bold text-gray-900">Protected Upload</p>
                            <p className="text-sm text-gray-500">Your original remains visible to humans.</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4 p-4 bg-white rounded-xl shadow-sm border border-gray-100">
                        <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                            <ShieldCheck className="w-5 h-5 text-red-600" />
                        </div>
                        <div>
                            <p className="font-bold text-gray-900">AI Blindness</p>
                            <p className="text-sm text-gray-500">Generators produce noise instead of copies.</p>
                        </div>
                    </div>
                </div>
            </div>


            {/* 2. CHAT INTERFACE (The Demo) */}
            <div className="w-full md:w-[420px] shrink-0 bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden flex flex-col h-[650px] relative">
                
                {/* Header - Minimalist */}
                <div className="bg-white/80 backdrop-blur-sm border-b border-gray-50 p-4 flex items-center justify-between shrink-0 z-10 sticky top-0">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white shadow-sm">
                            <Bot className="w-4 h-4" />
                        </div>
                        <div className="text-left">
                            <h4 className="font-semibold text-gray-900 text-sm leading-none">Generative AI Model</h4>
                            <p className="text-[10px] text-gray-400 mt-0.5 font-medium">Style Transfer v5.0</p>
                        </div>
                    </div>
                </div>

                {/* Messages Area - Clean & Minimal */}
                <div 
                    ref={scrollRef}
                    className="flex-1 bg-white p-4 overflow-y-auto space-y-4 scroll-smooth"
                >
                    {messages.map((msg) => (
                        <div 
                            key={msg.id} 
                            className={cn(
                                "flex flex-col gap-1 max-w-[85%] animate-in slide-in-from-bottom-2 duration-500 fade-in",
                                msg.role === "user" ? "ml-auto items-end" : "mr-auto items-start"
                            )}
                        >
                            {/* Simplified Bubble */}
                            <div className={cn(
                                "rounded-2xl text-sm shadow-sm overflow-hidden text-left",
                                msg.role === "user" 
                                    ? "bg-blue-600 text-white rounded-br-none" 
                                    : "bg-gray-100 text-gray-800 rounded-bl-none"
                            )}>
                                {msg.imageUrl && (
                                    <div className="relative w-full">
                                        
                                        {/* Result Logic showing Failure */}
                                        <img 
                                            src={msg.imageUrl} 
                                            alt="content" 
                                            className={cn(
                                                "w-full h-auto object-cover max-h-[180px] min-w-[200px] block", // width adjusted, block for no gaps
                                                msg.type === "image-result" && "filter contrast-[1.4] brightness-90 hue-rotate-[120deg] saturate-[3] blur-[1px] invert-[.1]" // THE GLITCH
                                            )}
                                        />
                                        
                                        {msg.type === "image-result" && (
                                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                                <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-40 mix-blend-overlay"></div>
                                            </div>
                                        )}
                                    </div>
                                )}
                                <div className={cn("px-4 py-2.5", msg.imageUrl ? "pt-2" : "")}>
                                    <p className="leading-relaxed font-normal">{msg.text}</p>
                                </div>
                            </div>
                        </div>
                    ))}

                    {/* Minimal Typing Indicator */}
                    {(status === "processing" || status === "generating") && (
                         <div className="flex flex-col gap-1 mr-auto items-start max-w-[85%] animate-in fade-in zoom-in duration-300">
                            <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm flex items-center gap-1.5">
                                {status === "generating" ? (
                                    <div className="flex items-center gap-2 text-xs text-gray-500 font-medium">
                                        <RefreshCw className="w-3 h-3 animate-spin" /> Generating Variation...
                                    </div>
                                ) : (
                                    <>
                                        <span className="w-1 h-1 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                                        <span className="w-1 h-1 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                                        <span className="w-1 h-1 bg-gray-400 rounded-full animate-bounce"></span>
                                    </>
                                )}
                            </div>
                         </div>
                    )}

                    {/* Spacer */}
                    <div className="h-4"></div>
                </div>

                {/* Input Area - Clean */}
                <div className="p-4 bg-white border-t border-gray-50 shrink-0">
                    <div className="flex flex-col gap-3">
                        {(status === "typing_prompt" || status === "awaiting_user_trigger") && (
                             <div className="flex items-center gap-2 px-2 py-1.5 rounded-md border border-gray-100 bg-gray-50/50 w-fit animate-in slide-in-from-bottom-2">
                                <div className="w-4 h-4 bg-gray-200 rounded flex items-center justify-center">
                                    <ImageIcon className="w-3 h-3 text-gray-500" />
                                </div>
                                <span className="text-[10px] font-medium text-gray-500 flex items-center gap-1 uppercase tracking-wide">
                                     protected-artwork.jpg
                                </span>
                             </div>
                        )}

                        <div 
                            className={cn(
                                "relative group transition-all duration-300",
                                status === "awaiting_user_trigger" ? "cursor-pointer" : ""
                            )}
                            onClick={() => {
                                if (status === "awaiting_user_trigger") {
                                    handleUserSubmit();
                                }
                            }}
                        >
                            <input
                                ref={inputRef}
                                readOnly
                                disabled={status !== "idle" && status !== "typing_prompt" && status !== "awaiting_user_trigger" && status !== "typing_complaint"} 
                                value={inputValue} 
                                placeholder="Message Generative AI Model..."
                                className={cn(
                                    "w-full pl-4 pr-12 py-3 rounded-full bg-gray-50 border-0 ring-1 ring-gray-100 focus:ring-0 text-sm transition-all disabled:opacity-50 placeholder:text-gray-400 pointer-events-none select-none",
                                    status === "awaiting_user_trigger" && "group-hover:ring-gray-300 group-hover:bg-gray-100"
                                )}
                            />
                            <div
                                className={cn(
                                    "absolute right-1.5 top-1.5 h-8 w-8 rounded-full flex items-center justify-center transition-all duration-300",
                                    (status === "awaiting_user_trigger") 
                                        ? "bg-blue-600 text-white shadow-md group-hover:scale-105 group-active:scale-95" 
                                        : "bg-gray-200 text-gray-400"
                                )}
                            >
                                <Send className="w-3.5 h-3.5" />
                            </div>

                            {showClickHint && (
                                <div className="absolute -top-20 right-2 z-20 pointer-events-none animate-in fade-in duration-500">
                                    <div className="flex flex-col items-center animate-bounce">
                                        <span className="text-red-500 font-bold text-2xl -rotate-12 font-mono whitespace-nowrap">click here</span>
                                        <ArrowDown className="w-10 h-10 text-red-500 -rotate-[30deg] translate-x-8" />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Overlay Button for Idle State - REMOVED, now completed overlay */}
                {status === "completed" && (
                    <div className="absolute inset-0 bg-white/60 backdrop-blur-sm z-20 flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-500">
                         <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-6 max-w-xs transform hover:scale-105 transition-all duration-300">
                            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                                <ShieldCheck className="w-6 h-6 text-green-600" />
                            </div>
                            <h4 className="text-xl font-bold text-gray-900 mb-2">Invisible Protection</h4>
                            <p className="text-sm text-gray-500 mb-6 font-medium leading-relaxed">
                                Our <span className="font-bold text-gray-900">AI Shield</span> protection technology blocks AI copying while keeping your art intact.
                            </p>
                            <Button 
                                onClick={startDemo} 
                                className="w-full bg-blue-600 text-white hover:bg-blue-700 rounded-full h-10 font-semibold shadow-lg hover:shadow-xl transition-all"
                            >
                               <RefreshCw className="w-4 h-4 mr-2" /> Replay
                            </Button>
                         </div>
                    </div>
                )}
            </div>
            
            <div className="md:hidden text-center max-w-sm mx-auto">
                 <p className="text-sm text-gray-500 italic">
                    * Interactive demo: We simulate an AI trying to copy a protected image.
                </p>
            </div>
        </div>
    );
}

