import { redirect } from "next/navigation";
import { getSession } from "@/modules/auth/utils/auth-utils";

export default async function HomePage() {
    const session = await getSession();
    // If no session, go to About page instead of Login
    redirect(session ? "/dashboard" : "/about");
}
