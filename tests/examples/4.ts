// Persistent counter using the KV store
import * as kv from "@spinframework/spin-kv";

export default {
    async fetch(request: Request): Promise<Response> {
        const store = kv.openDefault();
        const url = new URL(request.url);
        const key: string = url.searchParams.get("key") || "default";

        const count: number = ((await store.getJson(`counter:${key}`)) as number || 0) + 1;
        await store.setJson(`counter:${key}`, count);

        return Response.json({ key, count });
    },
};
