"use server";

import { CreditService } from "../services/credit.service";
import { requireAuth } from "@/modules/auth/utils/auth-utils";

export async function getCreditBalanceAction() {
    const user = await requireAuth();
    return await CreditService.getBalance(user.id);
}
