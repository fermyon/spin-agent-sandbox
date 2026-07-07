// Pre-bundled libraries exposed to user code via require(). Imported statically so
// esbuild bundles them into the component; reached at runtime through the registry.

import * as cheerio from "cheerio";
import * as nodeHtmlParser from "node-html-parser";
import * as zod from "zod";
import * as jsyaml from "js-yaml";
import * as nanoid from "nanoid";
import * as ulidx from "ulidx";
import * as uuid from "uuid";
import * as lodash from "lodash";
import * as dateFns from "date-fns";
import dayjs from "dayjs";

// The scoped `@spinframework/spin-kv` object is built per-request (it closes over the
// sandbox id) and injected here.
export function makeRequire(scopedKv: unknown): (name: string) => any {
  const registry: Record<string, any> = {
    cheerio,
    "node-html-parser": nodeHtmlParser,
    zod,
    "js-yaml": jsyaml,
    nanoid,
    ulidx,
    uuid,
    lodash,
    "date-fns": dateFns,
    dayjs,
    "@spinframework/spin-kv": scopedKv,
  };
  return (name: string) => {
    if (Object.prototype.hasOwnProperty.call(registry, name)) return registry[name];
    throw new Error(
      `module not found: '${name}'. The sandbox only bundles a fixed set of modules: ${Object.keys(
        registry
      ).join(", ")}`
    );
  };
}
