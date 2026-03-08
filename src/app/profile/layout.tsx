import PublicLayout from "@/modules/artworks/public.layout";

export default function ProfilePublicLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <PublicLayout>{children}</PublicLayout>;
}
