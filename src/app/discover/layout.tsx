import PublicLayout from "@/modules/artworks/public.layout";

export default function DiscoverLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <PublicLayout>{children}</PublicLayout>;
}
