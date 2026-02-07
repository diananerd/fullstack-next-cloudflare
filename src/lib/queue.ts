import { getCloudflareContext } from "@opennextjs/cloudflare";

type QueueContentType = "text" | "bytes" | "json" | "v8";

export async function sendToQueue(message: unknown, options?: { contentType?: QueueContentType }) {
    const context = await getCloudflareContext();
    const env = context.env as unknown as Cloudflare.Env;
    await env.drimit_shield_queue.send(message, options);
}

export async function sendBatchToQueue(messages: { body: unknown, contentType?: QueueContentType }[]) {
    const context = await getCloudflareContext();
    const env = context.env as unknown as Cloudflare.Env;
    await env.drimit_shield_queue.sendBatch(messages);
}
