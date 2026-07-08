// Structured JSON responses with routing
export default {
    async fetch(request: Request): Promise<Response> {
        const url = new URL(request.url);

        if (request.method === "POST") {
            const body: unknown = await request.json();
            return Response.json({ echo: body, timestamp: Date.now() });
        }

        return Response.json({
            message: "Hello from the API HELLO",
            method: request.method,
            path: url.pathname,
            params: Object.fromEntries(url.searchParams),
        });
    },
};
