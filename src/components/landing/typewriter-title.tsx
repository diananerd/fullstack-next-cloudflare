"use client";

import { useEffect, useState } from "react";

export function TypewriterTitle() {
    const [firstPart, setFirstPart] = useState("");
    const [secondPart, setSecondPart] = useState("");
    const [isFirstPartDone, setIsFirstPartDone] = useState(false);
    const [showCursor, setShowCursor] = useState(true);
    const [started, setStarted] = useState(false);

    const text1 = "Protect your Art ";
    const text2 = "against AI.";

    useEffect(() => {
        const timeout = setTimeout(() => {
            setStarted(true);
        }, 1000);
        return () => clearTimeout(timeout);
    }, []);

    useEffect(() => {
        if (!started) return;

        if (firstPart.length < text1.length) {
            const timeout = setTimeout(() => {
                setFirstPart(text1.slice(0, firstPart.length + 1));
            }, 50);
            return () => clearTimeout(timeout);
        } else {
            // Tiny pause before next line
            const timeout = setTimeout(() => {
                setIsFirstPartDone(true);
            }, 300);
            return () => clearTimeout(timeout);
        }
    }, [firstPart, started]);

    useEffect(() => {
        if (isFirstPartDone) {
            if (secondPart.length < text2.length) {
                const timeout = setTimeout(() => {
                    setSecondPart(text2.slice(0, secondPart.length + 1));
                }, 50);
                return () => clearTimeout(timeout);
            } else {
                // Remove cursor immediately when done
                setShowCursor(false);
            }
        }
    }, [isFirstPartDone, secondPart]);

    return (
        <h1 className="text-4xl md:text-6xl lg:text-7xl font-extrabold tracking-tight text-gray-900 leading-[1.1] min-h-[3.3em] md:min-h-[2.2em]">
            {firstPart}
            {!isFirstPartDone && (
                <span className="inline-block w-[3px] h-[1em] bg-gray-900 ml-1 align-bottom animate-cursor-blink" />
            )}
            <br className="hidden md:block" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">
                {secondPart}
                {isFirstPartDone && showCursor && (
                    <span className="inline-block w-[3px] h-[1em] bg-blue-600 ml-1 align-bottom animate-cursor-blink" />
                )}
            </span>
        </h1>
    );
}
