// Validate JSON request bodies with Zod
import * as z from "zod";

const UserSchema = z.object({
    name: z.string().min(1),
    email: z.email(),
    age: z.number().int().min(0).optional(),
});

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method !== "POST") {
            return Response.json({
                usage: "POST a JSON body like: { name, email, age? }",
                example: { name: "Alice", email: "alice@example.com", age: 30 },
            });
        }

        const body = await request.json();
        const result = UserSchema.safeParse(body);

        if (!result.success) {
            return Response.json(
                { valid: false, errors: result.error.issues },
                { status: 400 }
            );
        }

        return Response.json({ valid: true, data: result.data });
    },
};
