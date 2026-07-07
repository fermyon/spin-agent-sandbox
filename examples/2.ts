// Simple text response with query params
export default {
    async fetch(request: Request): Promise<Response> {
        const url = new URL(request.url);
        const name: string = url.searchParams.get("name") || "World";

        return new Response(`Hello, ${name}!`, {
            headers: { "content-type": "text/plain" },
        });
    },
};
