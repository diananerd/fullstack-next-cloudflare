"use client";

import { useEffect, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

// Initialize Stripe outside component to avoid recreation
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "");

function CheckoutForm({ amount }: { amount: number }) {
    const stripe = useStripe();
    const elements = useElements();
    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!stripe || !elements) return;

        setIsLoading(true);
        console.log("[PaymentModal] Submitting payment...");

        const { error } = await stripe.confirmPayment({
            elements,
            confirmParams: {
                // Determine base URL dynamically or use env
                return_url: `${window.location.origin}/billing`, 
            },
        });

        // This reached only on error
        if (error) {
            console.error("[PaymentModal] Payment failed:", error.message);
            setMessage(error.message || "An unexpected error occurred.");
            setIsLoading(false);
        } else {
            console.log("[PaymentModal] Payment success (redirecting...)");
            setIsLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <PaymentElement />
            {message && <div className="text-red-500 text-sm">{message}</div>}
             <Button 
                type="submit" 
                disabled={!stripe || isLoading} 
                className="w-full bg-indigo-600 hover:bg-indigo-700 font-semibold h-11"
            >
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Pay ${amount}.00
            </Button>
        </form>
    );
}

export function StripePaymentModal({ 
    open, 
    onOpenChange, 
    amount, 
    credits 
}: { 
    open: boolean, 
    onOpenChange: (open: boolean) => void, 
    amount: number, 
    credits: number 
}) {
    const [clientSecret, setClientSecret] = useState("");
    const [loadingSecret, setLoadingSecret] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        if (open && amount > 0) {
            setLoadingSecret(true);
            setError("");
            console.log("[PaymentModal] Initializing payment fetch for amount:", amount);
            
            // In a real app, you would pass the User ID from context or session handled by auth
            fetch("/api/billing/create-payment-intent", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ amount, credits }),
            })
                .then(async (res) => {
                    if (!res.ok) {
                        const txt = await res.text();
                        console.error("[PaymentModal] Failed to create payment intent:", txt);
                        throw new Error(txt);
                    }
                    return res.json();
                })
                .then((data: any) => {
                    console.log("[PaymentModal] Client secret received successfully");
                    setClientSecret(data.clientSecret);
                })
                .catch((err) => {
                    console.error("[PaymentModal] Failed to init payment", err);
                    setError("Could not initialize payment. Please try again later.");
                })
                .finally(() => {
                    setLoadingSecret(false);
                });
        }
    }, [open, amount, credits]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Secure Payment</DialogTitle>
                </DialogHeader>
                <div className="py-2">
                    <p className="mb-6 text-sm text-gray-500">
                        Purchasing <strong className="text-gray-900">{credits} Credits</strong> for <strong className="text-gray-900">${amount}.00</strong>
                    </p>
                    
                    {loadingSecret ? (
                         <div className="flex flex-col items-center justify-center p-12 gap-4">
                            <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
                            <p className="text-sm text-gray-400">Initializing Stripe...</p>
                        </div>
                    ) : error ? (
                        <div className="text-center p-4">
                            <p className="text-red-500 mb-2">{error}</p>
                            <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
                        </div>
                    ) : clientSecret ? (
                         <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: 'stripe' } }}>
                             <CheckoutForm amount={amount} />
                         </Elements>
                    ) : null}
                </div>
            </DialogContent>
        </Dialog>
    );
}
