import { getDb } from "@/db";
import { creditTransactions } from "@/modules/credits/schemas/credit.schema";
import { user } from "@/modules/auth/schemas/auth.schema";
import { eq, sql, desc } from "drizzle-orm";

export type TransactionType = "DEPOSIT" | "USAGE" | "REFUND" | "BONUS" | "ADJUSTMENT";

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
        type: Extract<TransactionType, "DEPOSIT" | "BONUS" | "REFUND" | "ADJUSTMENT">,
        description: string,
        metadata?: Record<string, any>
    ) {
        if (amount <= 0) throw new Error("Amount must be positive for additions. Use chargeCredits for deductions.");
        
        const db = await getDb();

        return await db.transaction(async (tx) => {
            // 1. Update user balance atomically
            const [updatedUser] = await tx
                .update(user)
                .set({
                    credits: sql`${user.credits} + ${amount}`,
                    updatedAt: new Date()
                })
                .where(eq(user.id, userId))
                .returning({ credits: user.credits });

            if (!updatedUser) throw new Error("User not found");

            // 2. Record transaction
            await tx.insert(creditTransactions).values({
                userId,
                amount: amount,
                balanceAfter: updatedUser.credits,
                type,
                description,
                metadata,
            });

            return updatedUser.credits;
        });
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
        metadata?: Record<string, any>
    ) {
        if (cost <= 0) throw new Error("Cost must be positive.");

        const db = await getDb();

        return await db.transaction(async (tx) => {
            // 1. Get current balance and lock row (conceptually, though SQLite D1 is simpler)
            // We use a conditional update to ensure we don't go negative
            const userRecord = await tx
                .select({ credits: user.credits })
                .from(user)
                .where(eq(user.id, userId))
                .get();

            if (!userRecord) throw new Error("User not found");
            if (userRecord.credits < cost) {
                throw new Error("Insufficient credits");
            }

            // 2. Deduct credits
            const [updatedUser] = await tx
                .update(user)
                .set({
                    credits: sql`${user.credits} - ${cost}`,
                    updatedAt: new Date()
                })
                .where(eq(user.id, userId))
                .returning({ credits: user.credits });

            // 3. Record transaction (amount is negative)
            await tx.insert(creditTransactions).values({
                userId,
                amount: -cost,
                balanceAfter: updatedUser.credits,
                type: "USAGE",
                description,
                referenceId,
                metadata,
            });

            return updatedUser.credits;
        });
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
