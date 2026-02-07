import { redirect } from "next/navigation";
import { getSession } from "./utils/auth-utils";

export default async function AuthLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await getSession();

    // If already logged in, redirect to artworks
    if (session) {
        redirect("/artworks");
    }

    return <div>{children}</div>;
}
