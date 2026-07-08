// Generate unique IDs with nanoid, ulidx, and uuid
import { nanoid } from "nanoid";
import { ulid } from "ulidx";
import { v4 as uuidv4 } from "uuid";

export default {
    async fetch(request: Request): Promise<Response> {
        return Response.json({
            nanoid: nanoid(),
            ulid: ulid(),
            uuid: uuidv4(),
        });
    },
};
