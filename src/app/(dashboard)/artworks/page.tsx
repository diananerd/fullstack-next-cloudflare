import ArtworksPage from "@/modules/artworks/artworks.page";

export default async function Page({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | undefined>>;
}) {
    const params = await searchParams;
    return (
        <ArtworksPage
            searchParams={searchParams}
            collectionId={params.collectionId}
        />
    );
}
