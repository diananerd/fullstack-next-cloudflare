"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteAccountAction } from "@/modules/auth/actions/account.action";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2, AlertTriangle, Loader2, Info } from "lucide-react";
import authRoutes from "@/modules/auth/auth.route";

export default function SettingsPage() {
    const router = useRouter();
    // Local state for feedback instead of toast
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error', message: string } | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [confirmationText, setConfirmationText] = useState("");

    const handleDeleteAccount = async () => {
        if (confirmationText !== "DELETE") return;
        
        setIsDeleting(true);
        setFeedback(null);
        try {
            const result = await deleteAccountAction();
            if (result.success) {
                setFeedback({ type: 'success', message: "Account deleted. Redirecting..." });
                setTimeout(() => {
                    router.push(authRoutes.login);
                }, 1500);
            } else {
                setFeedback({ type: 'error', message: result.error || "Something went wrong" });
                setIsDeleting(false);
            }
        } catch (error) {
            console.error(error);
            setFeedback({ type: 'error', message: "An unexpected error occurred." });
            setIsDeleting(false);
        }
    };

    return (
        <div className="container mx-auto max-w-4xl py-10 space-y-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Account Settings</h1>
                <p className="text-muted-foreground mt-1">
                    Manage your account preferences and data.
                </p>
            </div>

            <Card className="border-red-200 bg-red-50/10">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-red-600">
            {feedback && (
                <div className={`p-4 rounded-md flex items-center gap-2 ${
                    feedback.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
                }`}>
                    <Info className="h-4 w-4" />
                    <p className="text-sm font-medium">{feedback.message}</p>
                </div>
            )}

                        <Trash2 className="h-5 w-5" />
                        Danger Zone
                    </CardTitle>
                    <CardDescription>
                        Irreversible actions related to your account.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex flex-col space-y-2">
                        <h3 className="font-medium">Delete Account</h3>
                        <p className="text-sm text-muted-foreground">
                            Permanently delete your account, images, credits, and transaction history. 
                            This action cannot be undone.
                        </p>
                    </div>
                </CardContent>
                <CardFooter>
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="destructive">Delete Account</Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="border-red-200">
                            <AlertDialogHeader>
                                <AlertDialogTitle className="flex items-center gap-2 text-red-600">
                                    <AlertTriangle className="h-5 w-5" />
                                    Are you absolutely sure?
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                    This action cannot be undone. This will permanently delete your
                                    account and remove your data from our servers.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            
                            <div className="py-4 space-y-2">
                                <Label htmlFor="confirm-delete">
                                    Type <span className="font-bold text-red-600 select-none">DELETE</span> to confirm
                                </Label>
                                <Input 
                                    id="confirm-delete"
                                    value={confirmationText}
                                    onChange={(e) => setConfirmationText(e.target.value)}
                                    placeholder="DELETE"
                                    className="border-red-200 focus-visible:ring-red-500"
                                />
                            </div>

                            <AlertDialogFooter>
                                <AlertDialogCancel onClick={() => {
                                    setConfirmationText("");
                                    setIsDeleting(false);
                                }}>Cancel</AlertDialogCancel>
                                <Button 
                                    variant="destructive"
                                    onClick={handleDeleteAccount}
                                    disabled={confirmationText !== "DELETE" || isDeleting}
                                >
                                    {isDeleting ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Deleting...
                                        </>
                                    ) : (
                                        "Permanently Delete Account"
                                    )}
                                </Button>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </CardFooter>
            </Card>
        </div>
    );
}
