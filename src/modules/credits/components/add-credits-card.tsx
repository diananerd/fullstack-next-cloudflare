"use client";

import { useState } from "react";
import { Minus, Plus, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    CardFooter,
} from "@/components/ui/card";

import { StripePaymentModal } from "./stripe-payment-modal";

export function AddCreditsCard() {
    const [dollars, setDollars] = useState<number>(10);
    const [open, setOpen] = useState(false);

    // Rate: $1 = 1 Credit
    const credits = dollars;

    const handleIncrement = () => {
        setDollars((prev) => Math.min(prev + 5, 1000));
    };

    const handleDecrement = () => {
        setDollars((prev) => Math.max(prev - 5, 0));
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseInt(e.target.value);
        if (isNaN(val)) {
             setDollars(0); // Temporary state for typing
        } else {
             // Clamp visually on blur, but allow typing
             setDollars(val);
        }
    };

    const handleBlur = () => {
        if (dollars < 0) setDollars(0);
        if (dollars > 1000) setDollars(1000);
    };

    return (
        <Card className="flex flex-col h-full bg-gradient-to-br from-indigo-50/50 to-white">
            <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5 text-indigo-600" />
                    Add Credits
                </CardTitle>
                <CardDescription>
                    Purchase flexible credit packs. Limit $1 - $1000.
                </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col justify-center py-2">
                <div className="flex items-center gap-3">
                    <Button
                        variant="outline"
                        size="icon"
                        className="h-10 w-10 shrink-0"
                        onClick={handleDecrement}
                        disabled={dollars <= 0}
                    >
                        <Minus className="h-4 w-4" />
                    </Button>
                    
                    <div className="relative flex-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">$</span>
                        <Input
                            type="number"
                            min={0}
                            max={1000}
                            step={1}
                            value={dollars || ""}
                            onChange={handleInputChange}
                            onBlur={handleBlur}
                            className="text-center text-xl font-bold h-10 pl-7 pr-4"
                        />
                    </div>

                    <Button
                        variant="outline"
                        size="icon"
                        className="h-10 w-10 shrink-0"
                        onClick={handleIncrement}
                        disabled={dollars >= 1000}
                    >
                        <Plus className="h-4 w-4" />
                    </Button>
                </div>
                
                <div className="mt-4 text-center space-y-1">
                     <p className="text-gray-900 font-medium">
                        You receive: <span className="font-bold text-indigo-600 text-lg">{credits} Credits</span>
                     </p>
                     <p className="text-xs text-muted-foreground">
                        (${dollars}.00 USD)
                     </p>
                </div>
            </CardContent>
            <CardFooter className="pt-2">
                <Button 
                    className="w-full bg-indigo-600 hover:bg-indigo-700 font-semibold" 
                    onClick={() => setOpen(true)}
                    disabled={dollars < 1 || dollars > 1000}
                >
                    Purchase for ${dollars}
                </Button>
            </CardFooter>

            {/* Modal Placeholder - To be implemented */}
            <StripePaymentModal open={open} onOpenChange={setOpen} amount={dollars} credits={credits} />
        </Card>
    );
}
