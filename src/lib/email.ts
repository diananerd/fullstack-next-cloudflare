import { Resend } from "resend";

interface SendEmailParams {
    to: string;
    subject: string;
    html: string;
    text?: string;
    // biome-ignore lint/suspicious/noExplicitAny: Env is dynamic in Cloudflare
    env: Record<string, any>;
}

export async function sendEmail({
    to,
    subject,
    html,
    text,
    env,
}: SendEmailParams) {
    if (!env.RESEND_API_KEY) {
        console.warn(
            "[Email] RESEND_API_KEY is not defined. Email dispatch skipped.",
        );
        return { success: false, error: "Missing API Key" };
    }

    const resend = new Resend(env.RESEND_API_KEY);
    // Default to a safe sender or use env var
    const from =
        env.RESEND_FROM_EMAIL || "Drimit Shield <onboarding@resend.dev>";

    try {
        const { data, error } = await resend.emails.send({
            from,
            to,
            subject,
            html,
            text,
        });

        if (error) {
            console.error("[Email] Resend API Error:", error);
            return { success: false, error };
        }

        console.log(`[Email] Sent to ${to} (ID: ${data?.id})`);
        return { success: true, data };
    } catch (err) {
        console.error("[Email] Unexpected error:", err);
        return { success: false, error: err };
    }
}
