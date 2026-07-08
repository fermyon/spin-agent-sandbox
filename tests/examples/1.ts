// Parse HTML and extract structured data
import * as cheerio from "cheerio";

export default {
    async fetch(_request: Request): Promise<Response> {
        const html = `
      <html><body>
        <h1>Products</h1>
        <div class="product"><span class="name">Widget D</span><span class="price">$9.99</span></div>
        <div class="product"><span class="name">Widget E</span><span class="price">$14.50</span></div>
        <div class="product"><span class="name">Gadget F</span><span class="price">$29.00</span></div>
      </body></html>
    `;

        const $ = cheerio.load(html);
        const products: { name: string; price: string }[] = [];
        $(".product").each((_, el) => {
            products.push({
                name: $(el).find(".name").text(),
                price: $(el).find(".price").text(),
            });
        });

        console.log(`products: ${products}!`)

        return Response.json({ products });
    },
};
