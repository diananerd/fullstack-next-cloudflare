import ArtworksLayout from "@/modules/artworks/artworks.layout";

export default async function Layout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <ArtworksLayout>{children}</ArtworksLayout>;
}
