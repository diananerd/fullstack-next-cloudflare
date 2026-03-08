import { Navigation } from "@/components/navigation";

export default function ProfilePublicLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="flex flex-col min-h-screen">
            <Navigation />
            <div className="w-full h-full flex-1">{children}</div>
        </div>
    );
}
