import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

/** @type {import("next").NextConfig} */
const nextConfig = {
    serverExternalPackages: ["better-sqlite3"],
    experimental: {
        serverActions: {
            bodySizeLimit: "50mb",
        },
    },
};

if (process.env.NODE_ENV === "development") {
    initOpenNextCloudflareForDev();
}

export default nextConfig;
