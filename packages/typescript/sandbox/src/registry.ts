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
import * as spinKv from "@spinframework/spin-kv";

// @spinframework/spin-kv's getJson does JSON.parse(store.get(key) ?? empty), which
// throws on a missing key instead of returning null. Patch it here.
function patchGetJson(store: any) {
  const realGetJson = store.getJson.bind(store);
  store.getJson = (key: string) => (store.exists(key) ? realGetJson(key) : null);
  return store;
}
const spinKvPatched = {
  openDefault: () => patchGetJson(spinKv.openDefault()),
  open: (label: string) => patchGetJson(spinKv.open(label)),
};

export function makeRequire(): (name: string) => any {
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
    "@spinframework/spin-kv": spinKvPatched,
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
