import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

/** @type {import("next").NextConfig} */
const nextConfig = {
    typescript: {
        ignoreBuildErrors: false,
    },
    experimental: {
        serverActions: {
            bodySizeLimit: "50mb",
        },
    },
    serverExternalPackages: [],
};

if (process.env.NODE_ENV === "development") {
    initOpenNextCloudflareForDev();
}

export default nextConfig;
