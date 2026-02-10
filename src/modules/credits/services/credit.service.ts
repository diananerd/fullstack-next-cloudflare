import { getDb } from "@/db";
import { creditTransactions } from "@/modules/credits/schemas/credit.schema";
import { user } from "@/modules/auth/schemas/auth.schema";
import { eq, sql, desc, and, gte } from "drizzle-orm";

export type TransactionType =
    | "DEPOSIT"
    | "USAGE"
    | "REFUND"
    | "BONUS"
    | "ADJUSTMENT";

export class CreditService {
    /**
     * Get the current credit balance for a user
     */
    static async getBalance(userId: string): Promise<number> {
        const db = await getDb();
        const result = await db
            .select({ credits: user.credits })
            .from(user)
            .where(eq(user.id, userId))
            .get();

        return result?.credits ?? 0;
    }

    /**
     * Add credits to a user's account (Deposit, Bonus, Refund)
     */
    static async addCredits(
        userId: string,
        amount: number,
        type: Extract<
            TransactionType,
            "DEPOSIT" | "BONUS" | "REFUND" | "ADJUSTMENT"
        >,
        description: string,
        metadata?: Record<string, any>,
    ) {
        console.log(
            `[CreditService] addCredits called for userId=${userId}, amount=${amount}, type=${type}`,
        );
        if (amount <= 0) {
            console.error(`[CreditService] Invalid amount: ${amount}`);
            throw new Error(
                "Amount must be positive for additions. Use chargeCredits for deductions.",
            );
        }

        const db = await getDb();

        try {
            // NOTE: D1 Transactions (db.transaction) started failing with "Failed query: begin" in the Auth Hook context.
            // This is likely due to environment limitations or interaction with Better-Auth's internal state.
            // Falling back to sequential execution. Atomicity is slightly compromised (if 2nd fails, 1st sticks),
            // but availability is restored.

            console.log(
                `[CreditService] Updating user balance for userId=${userId}`,
            );
            // 1. Update user balance
            const [updatedUser] = await db
                .update(user)
                .set({
                    credits: sql`${user.credits} + ${amount}`,
                    updatedAt: new Date(),
                })
                .where(eq(user.id, userId))
                .returning({ credits: user.credits });

            if (!updatedUser) {
                console.error(
                    `[CreditService] User not found for userId=${userId}`,
                );
                throw new Error("User not found");
            }
            console.log(
                `[CreditService] User balance updated. New balance: ${updatedUser.credits}`,
            );

            // 2. Record transaction
            await db.insert(creditTransactions).values({
                userId,
                amount: amount,
                balanceAfter: updatedUser.credits,
                type,
                description,
                metadata,
            });
            console.log(
                `[CreditService] Transaction recorded for userId=${userId}`,
            );

            return updatedUser.credits;
        } catch (error) {
            console.error(
                `[CreditService] Operation failed for userId=${userId}:`,
                error,
            );
            throw error;
        }
    }

    /**
     * Deduct credits from a user's account (Usage)
     * Throws error if insufficient funds
     */
    static async chargeCredits(
        userId: string,
        cost: number,
        description: string,
        referenceId?: string,
        metadata?: Record<string, any>,
    ) {
        if (cost <= 0) throw new Error("Cost must be positive.");

        const db = await getDb();

        try {
            // Attempt atomic update ensuring balance doesn't go below 0
            // We verify the user has enough credits directly in the UPDATE condition
            const [updatedUser] = await db
                .update(user)
                .set({
                    credits: sql`${user.credits} - ${cost}`,
                    updatedAt: new Date(),
                })
                .where(and(eq(user.id, userId), gte(user.credits, cost)))
                .returning({ credits: user.credits });

            if (!updatedUser) {
                // Determine why it failed: User doesn't exist OR Insufficient funds
                const userRecord = await db
                    .select({ credits: user.credits })
                    .from(user)
                    .where(eq(user.id, userId))
                    .get();

                if (!userRecord) throw new Error("User not found");
                throw new Error("Insufficient credits");
            }

            // 3. Record transaction (amount is negative)
            await db.insert(creditTransactions).values({
                userId,
                amount: -cost,
                balanceAfter: updatedUser.credits,
                type: "USAGE",
                description,
                referenceId,
                metadata,
            });

            return updatedUser.credits;
        } catch (error) {
            console.error(
                `[CreditService] Charge failed for userId=${userId}:`,
                error,
            );
            throw error;
        }
    }

    /**
     * Get transaction history for a user
     */
    static async getHistory(userId: string, limit = 20, offset = 0) {
        const db = await getDb();
        return await db
            .select()
            .from(creditTransactions)
            .where(eq(creditTransactions.userId, userId))
            .orderBy(desc(creditTransactions.createdAt))
            .limit(limit)
            .offset(offset);
    }
}
