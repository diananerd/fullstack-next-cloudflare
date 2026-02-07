import { Shield, Home } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import LogoutButton from "../modules/auth/components/logout-button";
import { NavbarUploadButton } from "./navbar-upload";

export function Navigation() {
    return (
        <nav className="border-b bg-white sticky top-0 z-50">
            <div className="w-full px-6 py-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-6">
                        <Link
                            href="/dashboard"
                            className="text-xl text-gray-900 flex items-center gap-2"
                        >
                            <img src="/icon.png" alt="AI Shield Logo" className="h-8 w-8" />
                            <span className="flex items-center gap-4">
                                <span className="font-bold">Drimit</span>
                                <span className="font-normal text-lg text-blue-500">AI Shield</span>
                            </span>
                        </Link>
                    </div>
                    
                    <div className="flex items-center gap-4">
                        <NavbarUploadButton />
                        <LogoutButton />
                    </div>
                </div>
            </div>
        </nav>
    );
}
