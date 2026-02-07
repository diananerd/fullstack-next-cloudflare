import { SignupForm } from "./components/signup-form";

export default function SignUpPage() {
    return (
        <div className="bg-muted flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
            <div className="flex w-full max-w-sm flex-col gap-6">
                <a
                    href="/"
                    className="flex items-center gap-2 self-center font-medium"
                >
                    {/* biome-ignore lint/performance/noImgElement: Local icon */}
                    <img
                        src="/icon.png"
                        alt="Drimit Logo"
                        className="h-8 w-8"
                    />
                    <span className="flex items-center gap-2">
                        <span className="font-bold text-gray-900">Drimit</span>
                        <span className="font-normal text-blue-500">
                            AI Shield
                        </span>
                    </span>
                </a>
                <SignupForm />
            </div>
        </div>
    );
}
