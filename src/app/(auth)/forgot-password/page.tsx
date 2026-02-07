import ForgotPasswordPage from "@/modules/auth/forgot-password.page";
import { Metadata } from "next";

export const metadata: Metadata = {
    title: "Forgot Password - Drimit AI Shield",
    description: "Reset your password",
};

export default function Page() {
    return <ForgotPasswordPage />;
}
