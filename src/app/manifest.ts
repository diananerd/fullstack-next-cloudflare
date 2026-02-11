import { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: "Drimit",
        short_name: "Drimit",
        description: "Protect your images from generative AI editing.",
        start_url: "/?source=pwa",
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#ffffff",
        icons: [
            {
                src: "/icon.png",
                sizes: "192x192",
                type: "image/png",
            },
            {
                src: "/icon.png",
                sizes: "512x512",
                type: "image/png",
            },
        ],
    };
}
