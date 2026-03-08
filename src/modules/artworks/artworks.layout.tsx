import { redirect } from "next/navigation";
import { WelcomeModal } from "@/components/welcome-modal";
import { getSession } from "@/modules/auth/utils/auth-utils";
import authRoutes from "../auth/auth.route";
import PublicLayout from "./public.layout";

export default async function ArtworksLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await getSession();

    if (!session) {
        redirect(authRoutes.login);
    }

    return (
        <PublicLayout>
            {children}
            <WelcomeModal />
        </PublicLayout>
    );
}
