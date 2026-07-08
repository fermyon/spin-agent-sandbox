// Accept YAML, return JSON (or vice versa)
import yaml from "js-yaml";

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === "POST") {
      const text: string = await request.text();
      try {
        const data = yaml.load(text);
        return Response.json(data);
      } catch (e: any) {
        return Response.json({ error: e.message }, { status: 400 });
      }
    }

    const sample = {
      service: "my-app",
      version: "1.0",
      features: ["auth", "logging", "metrics"],
      config: { debug: false, workers: 4 },
    };
    return new Response(yaml.dump(sample), {
      headers: { "content-type": "text/yaml" },
    });
  },
};
