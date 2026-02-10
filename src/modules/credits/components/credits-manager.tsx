"use client";

import { useState } from "react";
import { Zap, Minus, Plus, CreditCard, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { StripePaymentModal } from "./stripe-payment-modal";
import { cn } from "@/lib/utils";

interface CreditsManagerProps {
    balance: number;
}

export function CreditsManager({ balance }: CreditsManagerProps) {
    const [dollars, setDollars] = useState<number>(10);
    const [open, setOpen] = useState(false);

    // Rate: $1 = 1 Credit
    const creditsToBuy = dollars;

    const handleIncrement = () => setDollars((prev) => Math.min(prev + 5, 1000));
    const handleDecrement = () => setDollars((prev) => Math.max(prev - 5, 0));

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseInt(e.target.value);
        if (isNaN(val)) {
            setDollars(0);
        } else {
            setDollars(val);
        }
    };

    const handleBlur = () => {
        if (dollars < 0) setDollars(0);
        if (dollars > 1000) setDollars(1000);
    };

    const quickAmounts = [10, 25, 50, 100];

    return (
        <>
            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                <div className="flex flex-col md:flex-row">
                    {/* Left Section: Balance Display */}
                    <div className="p-6 md:p-8 flex-1 bg-gradient-to-br from-indigo-50/50 to-white flex flex-col justify-center">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center">
                                <Zap className="h-4 w-4 text-indigo-600" />
                            </div>
                            <h2 className="text-sm font-semibold tracking-wide text-gray-500 uppercase">
                                Available Balance
                            </h2>
                        </div>
                        
                        <div className="flex items-baseline gap-2 mb-2">
                             <span className="text-5xl md:text-6xl font-extrabold text-gray-900 tracking-tight">
                                {balance.toFixed(2)}
                             </span>
                             <span className="text-xl font-medium text-gray-500">credits</span>
                        </div>
                        
                        <p className="text-sm text-muted-foreground flex items-center gap-2">
                            <span>Never expires</span>
                        </p>
                    </div>

                    {/* Divider for desktop, horizontal line for mobile */}
                    <div className="h-px w-full md:w-px md:h-auto bg-gray-100" />

                    {/* Right Section: Add Credits */}
                    <div className="p-6 md:p-8 flex-1 bg-white">
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-2">
                                <CreditCard className="h-4 w-4 text-gray-400" />
                                <h3 className="font-semibold text-gray-900">Add Credits</h3>
                            </div>
                            <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
                                Instant Delivery
                            </span>
                        </div>

                        {/* Amount Selector */}
                        <div className="space-y-6">
                            <div className="flex flex-col gap-4">
                                <div className="flex items-center gap-3">
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-12 w-12 shrink-0 rounded-full border-gray-200"
                                        onClick={handleDecrement}
                                        disabled={dollars <= 0}
                                    >
                                        <Minus className="h-4 w-4" />
                                    </Button>
                                    
                                    <div className="relative flex-1">
                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-semibold text-lg">$</span>
                                        <Input
                                            type="number"
                                            min={0}
                                            max={1000}
                                            step={1}
                                            value={dollars || ""}
                                            onChange={handleInputChange}
                                            onBlur={handleBlur}
                                            className="text-center text-2xl font-bold h-12 rounded-lg border-gray-200 pl-8 pr-4 shadow-sm focus-visible:ring-indigo-500"
                                        />
                                    </div>

                                    <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-12 w-12 shrink-0 rounded-full border-gray-200"
                                        onClick={handleIncrement}
                                        disabled={dollars >= 1000}
                                    >
                                        <Plus className="h-4 w-4" />
                                    </Button>
                                </div>
                                
                                {/* Quick Select Pills */}
                                <div className="flex flex-wrap gap-2 justify-center">
                                    {quickAmounts.map((amt) => (
                                        <button
                                            key={amt}
                                            onClick={() => setDollars(amt)}
                                            className={cn(
                                                "text-xs px-3 py-1.5 rounded-full border transition-colors font-medium",
                                                dollars === amt 
                                                    ? "bg-indigo-600 text-white border-indigo-600" 
                                                    : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300 hover:text-indigo-600"
                                            )}
                                        >
                                            ${amt}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-3">
                                <Button 
                                    className="w-full bg-indigo-600 hover:bg-indigo-700 font-semibold h-auto py-3 min-h-[3rem] text-sm md:text-base shadow-indigo-100 shadow-lg transition-all" 
                                    onClick={() => setOpen(true)}
                                    disabled={dollars < 1 || dollars > 1000}
                                >
                                    <span className="flex items-center justify-center gap-1 flex-wrap">
                                        <span className="sm:hidden">Buy {creditsToBuy} Credits (${dollars} USD)</span>
                                        <span className="hidden sm:inline">Purchase {creditsToBuy} Credits for ${dollars} USD</span>
                                        <ChevronRight className="h-4 w-4 opacity-50 shrink-0" />
                                    </span>
                                </Button>
                                <p className="text-center text-xs text-muted-foreground">
                                    Secured by Stripe • End-to-end encrypted
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <StripePaymentModal 
                open={open} 
                onOpenChange={setOpen} 
                amount={dollars} 
                credits={creditsToBuy} 
            />
        </>
    );
}
