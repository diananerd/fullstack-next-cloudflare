// @ts-nocheck
import openNextWorker from "./.open-next/worker.js";

export default {
    ...openNextWorker,
    async scheduled(curr, env, ctx) {
        // Direct call to sync-modal-status CRON
        console.log(
            `[Worker] Triggering scheduled sync at ${new Date(curr.scheduledTime).toISOString()} (Cron: ${curr.cron})`,
        );

        const url = new URL("http://127.0.0.1/api/cron/sync-modal-status");
        const req = new Request(url, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${env.CRON_SECRET}`,
                "Cron-Secret": env.CRON_SECRET || "",
            },
        });
        const resp = await openNextWorker.fetch(req, env, ctx);
        console.log(`[Worker] Sync completed. Status: ${resp.status}`);
    },
    async queue(batch, env, ctx) {
        // Dummy handler to allow deployment if Cloudflare thinks a queue is attached
        console.log(
            "[Worker] Queue event received (should not happen)",
            batch.queue,
        );
    },
};
