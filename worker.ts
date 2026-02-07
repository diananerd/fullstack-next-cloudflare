// @ts-nocheck
import { queueHandler } from "./src/queue-consumer";
import openNextWorker from "./.open-next/worker.js";

export default {
    ...openNextWorker,
    async queue(batch, env, ctx) {
        await queueHandler(batch, env);
    },
};
