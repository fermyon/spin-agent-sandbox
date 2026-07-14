// Full CRUD API backed by KV storage
import * as kv from "@spinframework/spin-kv";

interface Note {
    id: string;
    text: string;
    createdAt: string;
}

export default {
    async fetch(request: Request): Promise<Response> {
        const store = kv.openDefault();
        const url = new URL(request.url);
        const noteId: string | null = url.searchParams.get("id");

        // GET ?id=..., read one note
        if (request.method === "GET" && noteId) {
            const note = (await store.getJson(`note:${noteId}`)) as Note | null;
            if (!note) return Response.json({ error: "not found" }, { status: 404 });
            return Response.json(note);
        }

        // GET, list all notes
        if (request.method === "GET") {
            const keys: string[] = await store.getKeys();
            const notes: Note[] = [];
            for (const k of keys) {
                if (k.startsWith("note:")) {
                    notes.push((await store.getJson(k)) as Note);
                }
            }
            return Response.json(notes);
        }

        // POST, create a note
        if (request.method === "POST") {
            const body = (await request.json()) as { text?: string };
            const id: string = crypto.randomUUID().slice(0, 8);
            const note: Note = { id, text: body.text || "", createdAt: new Date().toISOString() };
            await store.setJson(`note:${id}`, note);
            return Response.json(note, { status: 201 });
        }

        // DELETE ?id=...
        if (request.method === "DELETE" && noteId) {
            await store.delete(`note:${noteId}`);
            return Response.json({ ok: true });
        }

        return Response.json({ error: "method not allowed" }, { status: 405 });
    },
};
