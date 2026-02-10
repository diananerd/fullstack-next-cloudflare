import { requireAuth } from "@/modules/auth/utils/auth-utils";
import { CreditService } from "@/modules/credits/services/credit.service";
import { CreditCard, History, Zap } from "lucide-react";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";

export default async function BillingPage() {
    const user = await requireAuth();
    
    // We re-fetch balance to be 100% sure it's up to date vs session
    const currentBalance = await CreditService.getBalance(user.id);
    const transactions = await CreditService.getHistory(user.id, 50);

    return (
        <div className="container mx-auto max-w-5xl py-10 space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Billing & Credits</h1>
                    <p className="text-muted-foreground mt-1">
                        Manage your credits and view transaction history.
                    </p>
                </div>
            </div>

            {/* Balance Card */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card className="bg-gradient-to-br from-primary/10 to-transparent border-primary/20">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Available Credits</CardTitle>
                        <Zap className="h-4 w-4 text-primary" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{currentBalance.toFixed(2)}</div>
                        <p className="text-xs text-muted-foreground">
                            1 Credit = 1 Image Processed
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Purchase Options (Mock for now) */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <CreditCard className="h-5 w-5" />
                        Add Credits
                    </CardTitle>
                    <CardDescription>
                        Purchase credit packs to process more images.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col sm:flex-row gap-4">
                        <div className="border rounded-lg p-4 flex-1 hover:bg-muted/50 transition bg-muted/20">
                            <h3 className="font-semibold text-lg">Starter Pack</h3>
                            <div className="text-2xl font-bold mt-2">10 Credits</div>
                            <div className="text-muted-foreground text-sm">$--</div>
                            <button className="mt-4 w-full bg-primary text-primary-foreground h-9 px-4 py-2 rounded-md text-sm font-medium opacity-50 cursor-not-allowed">
                                Coming Soon
                            </button>
                        </div>
                        <div className="border rounded-lg p-4 flex-1 hover:bg-muted/50 transition">
                            <h3 className="font-semibold text-lg">Pro Pack</h3>
                            <div className="text-2xl font-bold mt-2">50 Credits</div>
                            <div className="text-muted-foreground text-sm">$--</div>
                            <button className="mt-4 w-full bg-primary text-primary-foreground h-9 px-4 py-2 rounded-md text-sm font-medium opacity-50 cursor-not-allowed">
                                Coming Soon
                            </button>
                        </div>
                        <div className="border rounded-lg p-4 flex-1 hover:bg-muted/50 transition">
                            <h3 className="font-semibold text-lg">Enterprise</h3>
                            <div className="text-2xl font-bold mt-2">Custom</div>
                            <div className="text-muted-foreground text-sm">Contact Us</div>
                            <button className="mt-4 w-full bg-secondary text-secondary-foreground h-9 px-4 py-2 rounded-md text-sm font-medium opacity-50 cursor-not-allowed">
                                Contact Sales
                            </button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Transaction History */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <History className="h-5 w-5" />
                        Transaction History
                    </CardTitle>
                    <CardDescription>
                        Recent activity on your account.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Description</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead className="text-right">Amount</TableHead>
                                <TableHead className="text-right">Balance</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {transactions.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                                        No transactions found.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                transactions.map((tx) => (
                                    <TableRow key={tx.id}>
                                        <TableCell className="font-medium whitespace-nowrap">
                                            {formatDistanceToNow(tx.createdAt, { addSuffix: true })}
                                        </TableCell>
                                        <TableCell>{tx.description}</TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className={
                                                tx.type === 'DEPOSIT' || tx.type === 'BONUS' 
                                                    ? "bg-green-50 text-green-700 border-green-200" 
                                                    : "bg-orange-50 text-orange-700 border-orange-200"
                                            }>
                                                {tx.type}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className={`text-right font-medium ${
                                            tx.amount > 0 ? "text-green-600" : "text-orange-600"
                                        }`}>
                                            {tx.amount > 0 ? "+" : ""}{tx.amount.toFixed(2)}
                                        </TableCell>
                                        <TableCell className="text-right text-muted-foreground">
                                            {tx.balanceAfter.toFixed(2)}
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
