// Parse and transform HTML with node-html-parser
import { parse } from "node-html-parser";

export default {
    async fetch(request: Request): Promise<Response> {
        const html = `
      <html><body>
        <h1>Articles</h1>
        <article>
          <h2 class="title">First Post</h2>
          <p class="summary">An intro to Spin</p>
          <a href="/posts/1">Read more</a>
        </article>
        <article>
          <h2 class="title">Second Post</h2>
          <p class="summary">Building APIs</p>
          <a href="/posts/2">Read more</a>
        </article>
      </body></html>
    `;

        const root = parse(html);
        const articles = root.querySelectorAll("article").map((el) => ({
            title: el.querySelector(".title")?.text,
            summary: el.querySelector(".summary")?.text,
            link: el.querySelector("a")?.getAttribute("href"),
        }));

        return Response.json({ articles });
    },
};
