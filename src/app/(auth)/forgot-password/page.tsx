import type { Metadata } from "next";
import ForgotPasswordPage from "@/modules/auth/forgot-password.page";

export const metadata: Metadata = {
    title: "Forgot Password - Drimit",
    description: "Reset your password",
};

export default function Page() {
    return <ForgotPasswordPage />;
}
