import Image from "next/image";
import Link from "next/link";
import { getCurrentUser } from "@/modules/auth/utils/auth-utils";
import { NavigationUserMenu } from "./navigation-user-menu";
import { CreditService } from "@/modules/credits/services/credit.service";
import { badgeVariants } from "@/components/ui/badge";
import { Coins } from "lucide-react";

export async function Navigation() {
    const user = await getCurrentUser();
    const credits = user ? await CreditService.getBalance(user.id) : 0;

    return (
        <nav className="border-b bg-white sticky top-0 z-50">
            <div className="w-full px-4 md:px-6 py-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-6">
                        <Link
                            href={user ? "/artworks" : "/"}
                            className="flex items-center gap-2"
                        >
                            <Image
                                src="/icon.png"
                                alt="Drimit"
                                width={32}
                                height={32}
                                className="h-8 w-8"
                                unoptimized
                            />
                            <span className="flex items-center gap-2 text-xl">
                                <span className="font-bold text-gray-900">
                                    Drimit
                                </span>
                            </span>
                        </Link>
                    </div>
                    <div className="flex items-center gap-4">
                        {user && (
                            <>
                                <Link
                                    href="/billing"
                                    className="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
                                >
                                    <span className="font-bold text-gray-900 text-lg">
                                        ${credits.toFixed(2)}
                                    </span>
                                    <span className="text-sm text-muted-foreground font-medium">
                                        credits
                                    </span>
                                </Link>
                                <NavigationUserMenu user={user} />
                            </>
                        )}
                    </div>
                </div>
            </div>
        </nav>
    );
}
