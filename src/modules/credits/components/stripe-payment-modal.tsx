"use client";

import { useEffect, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";

// Initialize Stripe outside component to avoid recreation
const pubKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "";
if (!pubKey) {
    console.error("[StripePaymentModal] NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is missing!");
} else {
    console.log(`[StripePaymentModal] Stripe Public Key loaded (starts with: ${pubKey.substring(0, 7)}...)`);
}
const stripePromise = loadStripe(pubKey);

function CheckoutForm({ amount, onSuccess }: { amount: number, onSuccess: () => void }) {
    const stripe = useStripe();
    const elements = useElements();
    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!stripe || !elements) return;

        setIsLoading(true);
        console.log("[PaymentModal] Submitting payment...");

        const { error, paymentIntent } = await stripe.confirmPayment({
            elements,
            redirect: "if_required",
            confirmParams: {
                return_url: `${window.location.origin}/billing`, 
            },
        });

        if (error) {
            console.error("[PaymentModal] Payment failed:", error.message);
            setMessage(error.message || "An unexpected error occurred.");
            setIsLoading(false);
        } else if (paymentIntent && paymentIntent.status === "succeeded") {
            console.log("[PaymentModal] Payment success! Verifying with server...");
            
            // Call verification endpoint to ensure credits are added immediately
            // (In case webhooks are slow or unconfigured)
            try {
                const res = await fetch("/api/billing/verify-payment", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ paymentIntentId: paymentIntent.id }),
                });
                
                if (!res.ok) {
                    console.warn("[PaymentModal] Server verification warning:", await res.text());
                    // We still proceed to success screen because payment DID succeed Stripe-side.
                    // The webhook will likely handle it if this failed, or user can contact support.
                } else {
                    console.log("[PaymentModal] Server verification complete.");
                }
            } catch (err) {
                console.error("[PaymentModal] Verification fetch error:", err);
            }

            setIsLoading(false);
            onSuccess();
        } else {
             // Case where it might be processing or requires redirect (though 'if_required' usually handles that)
             console.log("[PaymentModal] Unhandled payment status:", paymentIntent?.status);
             setIsLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <PaymentElement />
            {message && <div className="text-red-500 text-sm bg-red-50 p-2 rounded border border-red-100">{message}</div>}
             <Button 
                type="submit" 
                disabled={!stripe || isLoading} 
                className="w-full bg-indigo-600 hover:bg-indigo-700 font-semibold h-11 transition-all"
            >
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Pay ${amount}.00 USD
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
    const [success, setSuccess] = useState(false);
    const router = useRouter();

    useEffect(() => {
        if (open && amount > 0) {
            setLoadingSecret(true);
            setError("");
            setSuccess(false);
            console.log("[PaymentModal] Initializing payment fetch for amount:", amount);
            
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

    const handleSuccess = () => {
        setSuccess(true);
        router.refresh(); // Refresh server components (balance)
        // Close modal after delay? or let user close.
        setTimeout(() => {
            // onOpenChange(false); 
            // Better to let user see the success message
        }, 2000); 
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto w-full">
                <DialogHeader>
                    <DialogTitle>{success ? "Payment Successful" : "Secure Payment"}</DialogTitle>
                </DialogHeader>
                <div className="py-2">
                    {success ? (
                        <div className="flex flex-col items-center justify-center p-8 gap-4 text-center animate-in fade-in zoom-in duration-300">
                            <div className="h-16 w-16 bg-green-100 rounded-full flex items-center justify-center">
                                <CheckCircle2 className="h-10 w-10 text-green-600" />
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-gray-900">Thank you!</h3>
                                <p className="text-gray-500 mt-1">Your payment was successful. <br/> {credits} credits have been added to your account.</p>
                            </div>
                            <Button className="mt-4 min-w-[120px]" onClick={() => onOpenChange(false)}>
                                Done
                            </Button>
                        </div>
                    ) : (
                        <>
                             <p className="mb-6 text-sm text-gray-500">
                                Purchasing <strong className="text-gray-900">{credits} Credits</strong> for <strong className="text-gray-900">${amount}.00 USD</strong>
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
                                    <CheckoutForm amount={amount} onSuccess={handleSuccess} />
                                </Elements>
                            ) : null}
                        </>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
