import { requireAuth } from "@/modules/auth/utils/auth-utils";
import { CreditService } from "@/modules/credits/services/credit.service";
import { History } from "lucide-react";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { CreditsManager } from "@/modules/credits/components/credits-manager";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

export default async function BillingPage({
    searchParams,
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
    const user = await requireAuth();
    const resolvedParams = await searchParams;
    const page = Number(resolvedParams?.page) || 1;
    const pageSize = 10;
    const offset = (page - 1) * pageSize;

    // We re-fetch balance to be 100% sure it's up to date vs session
    const currentBalance = await CreditService.getBalance(user.id);
    const transactions = await CreditService.getHistory(user.id, pageSize, offset);
    const totalCount = await CreditService.getHistoryCount(user.id);
    const totalPages = Math.ceil(totalCount / pageSize);

    return (
        <div className="w-full max-w-5xl mx-auto px-4 md:px-6 py-10 space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">
                        Credits
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Manage your credits and view transaction history.
                    </p>
                </div>
            </div>

            {/* Top Section: Credits Manager */}
            <CreditsManager balance={currentBalance} />

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
                                <TableHead className="text-right">
                                    Amount
                                </TableHead>
                                <TableHead className="text-right">
                                    Balance
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {transactions.length === 0 ? (
                                <TableRow>
                                    <TableCell
                                        colSpan={5}
                                        className="text-center py-8 text-muted-foreground"
                                    >
                                        No transactions found.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                transactions.map((tx) => (
                                    <TableRow key={tx.id}>
                                        <TableCell className="font-medium whitespace-nowrap first-letter:capitalize">
                                            {formatDistanceToNow(tx.createdAt, {
                                                addSuffix: true,
                                            })}
                                        </TableCell>
                                        <TableCell>{tx.description}</TableCell>
                                        <TableCell>
                                            <Badge
                                                variant="outline"
                                                className={
                                                    tx.type === "DEPOSIT" ||
                                                    tx.type === "BONUS"
                                                        ? "bg-green-50 text-green-700 border-green-200"
                                                        : "bg-orange-50 text-orange-700 border-orange-200"
                                                }
                                            >
                                                {tx.type}
                                            </Badge>
                                        </TableCell>
                                        <TableCell
                                            className={`text-right font-medium ${
                                                tx.amount > 0
                                                    ? "text-green-600"
                                                    : "text-orange-600"
                                            }`}
                                        >
                                            {tx.amount > 0 ? "+" : ""}
                                            {tx.amount.toFixed(2)}
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
                {totalPages > 1 && (
                    <div className="flex items-center justify-end space-x-2 py-4 px-4 text-sm text-muted-foreground border-t">
                        <div className="mr-auto">
                            Page {page} of {totalPages}
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            asChild
                            disabled={page <= 1}
                        >
                            <Link
                                href={{
                                    pathname: "/billing",
                                    query: {
                                        page: page > 1 ? page - 1 : 1,
                                    },
                                }}
                                className={page <= 1 ? "pointer-events-none opacity-50" : ""}
                            >
                                <ChevronLeft className="h-4 w-4" />
                                Previous
                            </Link>
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            asChild
                            disabled={page >= totalPages}
                        >
                            <Link
                                href={{
                                    pathname: "/billing",
                                    query: {
                                        page: page < totalPages ? page + 1 : totalPages,
                                    },
                                }}
                                className={
                                    page >= totalPages
                                        ? "pointer-events-none opacity-50"
                                        : ""
                                }
                            >
                                Next
                                <ChevronRight className="h-4 w-4" />
                            </Link>
                        </Button>
                    </div>
                )}
            </Card>
        </div>
    );
}
