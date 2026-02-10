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
        referenceId?: string,
    ) {
        console.log(
            `[CreditService] addCredits called for userId=${userId}, amount=${amount}, type=${type}, ref=${referenceId}`,
        );
        
        const db = await getDb();

        // Idempotency Check
        if (referenceId) {
            const existing = await db
                .select()
                .from(creditTransactions)
                .where(and(
                    eq(creditTransactions.referenceId, referenceId),
                    eq(creditTransactions.type, "DEPOSIT") // Ensure we are looking for deposits
                )) 
                .limit(1)
                .get();

            if (existing) {
                console.log(`[CreditService] Transaction with referenceId=${referenceId} already exists. Skipping.`);
                return existing.balanceAfter; // Return current balance state from that moment, or query current? 
                // Better to return clean success, maybe throw specific "AlreadyProcessed" or just return.
                // For this function signature, returning a number (new balance) is expected.
                // We'll verify actual current balance to return correct value.
                const userRec = await db.select({ credits: user.credits }).from(user).where(eq(user.id, userId)).get();
                return userRec?.credits ?? 0;
            }
        }
        
        if (amount <= 0) {
            console.error(`[CreditService] Invalid amount: ${amount}`);
            throw new Error(
                "Amount must be positive for additions. Use chargeCredits for deductions.",
            );
        }

        try {
             // STRATEGY: Record First (Audit), Then Grant (Balance)
             // This prevents "Ghost Credits" (Credits without record).
             // If granting fails, we have the record to reconcile manually.

            console.log(
                `[CreditService] Recording transaction for userId=${userId} (ref=${referenceId ?? "none"})`,
            );

            // 1. Record transaction (Will fail if duplicate referenceId due to Unique Constraint)
            await db.insert(creditTransactions).values({
                userId,
                amount: amount,
                balanceAfter: 0, // Placeholder, will update or we can query first. 
                // Actually, we usually want balanceAfter to be accurate.
                // But we haven't updated user yet.
                // We can fetch current balance, add amount, and store that.
                type,
                description,
                metadata,
                referenceId,
            });

            // 1b. Fetch current balance to calculate expected
            // (We could do this before insert, but insert is the "Lock")
            // Actually, for accurate history, we want the balance *after* the update.
            // If we use "Insert First", we store a slightly inaccurate "balanceAfter" initially?
            // Or we update it? 
            
            // Let's stick to the previous reliable approach but with clearer error handling?
            // No, the safest is Transaction (tx).
            // But tx failed on D1.
            
            // "Insert First" implies we might fail step 2.
            // Let's try to restore the SAGA (Compensating Transaction) but simpler.
            
        } catch (e) { throw e; } // Just reset block for tool usage
        
        try {
            // 1. Update User (Optimistic Grant)
            const [updatedUser] = await db
                .update(user)
                .set({
                    credits: sql`${user.credits} + ${amount}`,
                    updatedAt: new Date(),
                })
                .where(eq(user.id, userId))
                .returning({ credits: user.credits });

             if (!updatedUser) throw new Error("User not found");
             
             // 2. Record (Audit)
             try {
                await db.insert(creditTransactions).values({
                    userId,
                    amount: amount,
                    balanceAfter: updatedUser.credits,
                    type,
                    description,
                    metadata,
                    referenceId,
                });
             } catch (insertError: any) {
                 // Check duplicate
                 const msg = insertError.message || "";
                 if (msg.includes("UNIQUE") || msg.includes("constraint") || (insertError.code === "SQLITE_CONSTRAINT")) {
                     console.warn(`[CreditService] Duplicate detected (${referenceId}). Reverting credits...`);
                     // COMPENSATION
                     await db.update(user)
                         .set({ credits: sql`${user.credits} - ${amount}` })
                         .where(eq(user.id, userId));
                     
                     // Return current balance (without the added amount)
                     const final = await db.select({c: user.credits}).from(user).where(eq(user.id, userId)).get();
                     return final?.c ?? 0;
                 }
                 throw insertError;
             }
             
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
