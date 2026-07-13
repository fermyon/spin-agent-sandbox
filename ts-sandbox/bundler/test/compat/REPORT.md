# Bundler → Sandbox compatibility sweep

**477/571 libraries pass end-to-end** (bundle + run + expected output).

| outcome | count |
|---|---|
| `pass` | 477 |
| `wrong_output` | 1 |
| `runtime_error` | 48 |
| `compile_error` | 29 |
| `bundle_error` | 16 |

## Results

| library | version | category | outcome | fetches | modules | bytes | ms | detail |
|---|---|---|---|--:|--:|--:|--:|---|
| `@anthropic-ai/sdk` | ^0.27.0 | ai-clients-tokenizers | ✅ pass | 2 | 4 | 56992 | 632 |  |
| `@google/generative-ai` | ^0.21.0 | ai-clients-tokenizers | ✅ pass | 2 | 2 | 24246 | 1854 |  |
| `ai` | ^3.4.0 | ai-clients-tokenizers | ✅ pass | 11 | 12 | 236561 | 4926 |  |
| `groq-sdk` | ^0.7.0 | ai-clients-tokenizers | ✅ pass | 2 | 4 | 37587 | 2092 |  |
| `llama-tokenizer-js` | ^1.2.1 | ai-clients-tokenizers | ✅ pass | 2 | 2 | 662989 | 885 |  |
| `openai` | ^4.67.0 | ai-clients-tokenizers | ✅ pass | 2 | 4 | 125186 | 3077 |  |
| `openai-edge` | ^1.2.2 | ai-clients-tokenizers | ✅ pass | 2 | 2 | 24366 | 660 |  |
| `ansi-regex` | ^6.1.0 | ansi-string | ✅ pass | 2 | 2 | 3176 | 151 |  |
| `ansi-styles` | ^6.2.1 | ansi-string | ✅ pass | 2 | 2 | 5679 | 906 |  |
| `common-tags` | ^1.8.2 | ansi-string | ✅ pass | 2 | 2 | 21677 | 381 |  |
| `dedent` | ^1.5.3 | ansi-string | ✅ pass | 2 | 2 | 5389 | 247 |  |
| `emoji-regex` | ^10.4.0 | ansi-string | ✅ pass | 2 | 2 | 17130 | 235 |  |
| `slice-ansi` | ^7.1.0 | ansi-string | ✅ pass | 2 | 2 | 8873 | 253 |  |
| `sprintf-js` | ^1.1.3 | ansi-string | ✅ pass | 2 | 2 | 7121 | 328 |  |
| `strip-ansi` | ^7.1.0 | ansi-string | ✅ pass | 2 | 2 | 3339 | 148 |  |
| `async` | ^3.2.5 | async-flow | ✅ pass | 2 | 3 | 27323 | 899 |  |
| `async-retry` | ^1.3.3 | async-flow | ✅ pass | 2 | 2 | 7836 | 209 |  |
| `await-to-js` | ^3.0.0 | async-flow | ✅ pass | 2 | 2 | 3259 | 900 |  |
| `bluebird` | ^3.7.2 | async-flow | ✅ pass | 2 | 3 | 88450 | 2084 |  |
| `p-all` | ^5.0.0 | async-flow | ✅ pass | 2 | 2 | 4670 | 254 |  |
| `p-defer` | ^4.0.1 | async-flow | ✅ pass | 2 | 2 | 3108 | 202 |  |
| `p-props` | ^6.0.0 | async-flow | ✅ pass | 2 | 2 | 5106 | 242 |  |
| `p-reduce` | ^3.0.0 | async-flow | ✅ pass | 2 | 2 | 3260 | 226 |  |
| `p-some` | ^6.0.0 | async-flow | ✅ pass | 2 | 3 | 8436 | 320 |  |
| `p-timeout` | ^6.1.2 | async-flow | ✅ pass | 2 | 2 | 4436 | 142 |  |
| `promise-retry` | ^2.0.1 | async-flow | ✅ pass | 2 | 2 | 8423 | 727 |  |
| `rxjs` | ^7.8.0 | async-flow | ✅ pass | 4 | 4 | 103662 | 1319 |  |
| `@oslojs/crypto` | ^1.0.1 | auth-oauth | ✅ pass | 4 | 4 | 23275 | 995 |  |
| `@oslojs/encoding` | ^1.1.0 | auth-oauth | ✅ pass | 2 | 2 | 7888 | 739 |  |
| `@oslojs/jwt` | ^0.3.0 | auth-oauth | ✅ pass | 2 | 2 | 11244 | 535 |  |
| `@oslojs/oauth2` | ^0.5.0 | auth-oauth | ✅ pass | 2 | 2 | 6096 | 1069 |  |
| `arctic` | ^3.6.0 | auth-oauth | ✅ pass | 2 | 2 | 72587 | 2958 |  |
| `iron-session` | ^8.0.4 | auth-oauth | ✅ pass | 2 | 2 | 16297 | 444 |  |
| `oauth-1.0a` | ^2.2.6 | auth-oauth | ✅ pass | 2 | 2 | 8040 | 322 |  |
| `oauth4webapi` | ^3.1.4 | auth-oauth | ✅ pass | 2 | 2 | 62708 | 3460 |  |
| `lodash` |  | built-in | ✅ pass | 0 | 0 | 1360 | 1 |  |
| `nanoid` |  | built-in | ✅ pass | 0 | 0 | 1340 | 0 |  |
| `uuid` |  | built-in | ✅ pass | 0 | 0 | 1330 | 1 |  |
| `arg` | ^5.0.2 | cli-args | ✅ pass | 2 | 3 | 7250 | 298 |  |
| `cac` | ^6.7.14 | cli-args | ✅ pass | 2 | 4 | 15488 | 309 |  |
| `command-line-args` | ^6.0.1 | cli-args | ✅ pass | 2 | 3 | 20685 | 320 |  |
| `commander` | ^12.1.0 | cli-args | ✅ pass | 2 | 8 | 50515 | 522 |  |
| `dashdash` | ^2.0.0 | cli-args | ✅ pass | 2 | 9 | 31722 | 1125 |  |
| `minimist` | ^1.2.8 | cli-args | ✅ pass | 2 | 2 | 6976 | 214 |  |
| `mri` | ^1.2.0 | cli-args | ✅ pass | 2 | 2 | 4515 | 187 |  |
| `optionator` | ^0.9.4 | cli-args | ✅ pass | 2 | 3 | 44749 | 686 |  |
| `sade` | ^1.8.1 | cli-args | ✅ pass | 2 | 3 | 10172 | 1231 |  |
| `yargs` | ^17.7.2 | cli-args | ✅ pass | 2 | 8 | 95986 | 1013 |  |
| `yargs-parser` | ^21.1.1 | cli-args | ✅ pass | 2 | 6 | 24588 | 463 |  |
| `clone` | ^2.1.2 | clone-lru | ✅ pass | 2 | 3 | 10775 | 167 |  |
| `clone-deep` | ^4.0.1 | clone-lru | ✅ pass | 2 | 3 | 13273 | 223 |  |
| `copy-anything` | ^3.0.5 | clone-lru | ✅ pass | 2 | 2 | 3577 | 235 |  |
| `deepmerge-ts` | ^7.1.0 | clone-lru | ✅ pass | 2 | 2 | 9604 | 308 |  |
| `defu` | ^6.1.4 | clone-lru | ✅ pass | 2 | 2 | 3663 | 213 |  |
| `fast-copy` | ^3.0.2 | clone-lru | ✅ pass | 2 | 2 | 7117 | 200 |  |
| `klona` | ^2.0.6 | clone-lru | ✅ pass | 2 | 2 | 3427 | 152 |  |
| `lru-cache` | ^11.0.0 | clone-lru | ✅ pass | 2 | 3 | 28979 | 932 |  |
| `quick-lru` | ^7.0.0 | clone-lru | ✅ pass | 2 | 2 | 7716 | 652 |  |
| `rfdc` | ^1.4.0 | clone-lru | ✅ pass | 2 | 3 | 11248 | 287 |  |
| `ts-deepmerge` | ^7.0.0 | clone-lru | ✅ pass | 2 | 2 | 3622 | 176 |  |
| `@cfworker/base64url` | ^1.12.5 | cloud-signing-cfworker | ✅ pass | 2 | 2 | 3873 | 534 |  |
| `@cfworker/json-schema` | ^4.0.0 | cloud-signing-cfworker | ✅ pass | 2 | 2 | 25007 | 448 |  |
| `@cfworker/uuid` | ^4.0.4 | cloud-signing-cfworker | ✅ pass | 2 | 2 | 3666 | 385 |  |
| `aws4fetch` | ^1.0.20 | cloud-signing-cfworker | ✅ pass | 2 | 2 | 11538 | 327 |  |
| `itty-fetcher` | ^1.0.0 | cloud-signing-cfworker | ✅ pass | 2 | 2 | 4642 | 315 |  |
| `itty-time` | ^1.0.6 | cloud-signing-cfworker | ✅ pass | 2 | 2 | 3073 | 340 |  |
| `toucan-js` | ^3.4.0 | cloud-signing-cfworker | ✅ pass | 2 | 2 | 80167 | 2212 |  |
| `denque` | ^2.1.0 | collections-async | ✅ pass | 2 | 2 | 9306 | 976 |  |
| `eventemitter3` | ^5.0.0 | collections-async | ✅ pass | 2 | 2 | 6471 | 230 |  |
| `immutable` | ^4.3.0 | collections-async | ✅ pass | 2 | 2 | 69354 | 995 |  |
| `mitt` | ^3.0.0 | collections-async | ✅ pass | 2 | 2 | 3194 | 234 |  |
| `mnemonist` | ^0.39.0 | collections-async | ✅ pass | 2 | 2 | 6569 | 1011 |  |
| `nanoevents` | ^9.0.0 | collections-async | ✅ pass | 2 | 2 | 3452 | 233 |  |
| `p-limit` | ^5.0.0 | collections-async | ✅ pass | 2 | 2 | 4894 | 96 |  |
| `p-map` | ^7.0.0 | collections-async | ✅ pass | 2 | 2 | 6308 | 62 |  |
| `p-queue` | ^8.0.0 | collections-async | ✅ pass | 2 | 2 | 14215 | 251 |  |
| `p-retry` | ^6.0.0 | collections-async | ✅ pass | 2 | 2 | 9743 | 105 |  |
| `tiny-queue` | ^0.2.1 | collections-async | ✅ pass | 2 | 2 | 4161 | 254 |  |
| `yocto-queue` | ^1.1.0 | collections-async | ✅ pass | 2 | 2 | 4229 | 193 |  |
| `bytes` | ^3.1.2 | color-format | ✅ pass | 2 | 2 | 4794 | 176 |  |
| `chroma-js` | ^2.4.2 | color-format | ✅ pass | 2 | 2 | 38009 | 864 |  |
| `color` | ^4.2.3 | color-format | ✅ pass | 2 | 2 | 26489 | 501 |  |
| `color-convert` | ^2.0.1 | color-format | ✅ pass | 2 | 2 | 17009 | 365 |  |
| `color-name` | ^2.0.0 | color-format | ✅ pass | 2 | 2 | 6384 | 529 |  |
| `color-string` | ^1.9.1 | color-format | ✅ pass | 2 | 2 | 10938 | 779 |  |
| `colord` | ^2.9.3 | color-format | ✅ pass | 2 | 2 | 8443 | 235 |  |
| `filesize` | ^10.1.6 | color-format | ✅ pass | 2 | 2 | 5147 | 273 |  |
| `pretty-bytes` | ^6.1.1 | color-format | ✅ pass | 2 | 2 | 4064 | 174 |  |
| `tinycolor2` | ^1.6.0 | color-format | ✅ pass | 2 | 2 | 18179 | 338 |  |
| `compare-versions` | ^6.1.0 | config-semver | ✅ pass | 2 | 2 | 4949 | 372 |  |
| `dotenv` | ^16.4.0 | config-semver | ✅ pass | 2 | 7 | 20809 | 232 |  |
| `dotenv-expand` | ^11.0.0 | config-semver | ✅ pass | 4 | 9 | 23519 | 528 |  |
| `dotenv-parse-variables` | ^2.0.0 | config-semver | ✅ pass | 2 | 3 | 13803 | 420 |  |
| `env-var` | ^7.5.0 | config-semver | ✅ pass | 2 | 4 | 16227 | 312 |  |
| `rc` | ^1.2.8 | config-semver | ✅ pass | 2 | 2 | 3582 | 160 |  |
| `semver` | ^7.6.0 | config-semver | ✅ pass | 2 | 3 | 32847 | 523 |  |
| `semver-compare` | ^1.0.0 | config-semver | ✅ pass | 2 | 2 | 3979 | 213 |  |
| `semver-diff` | ^4.0.0 | config-semver | ✅ pass | 2 | 3 | 31375 | 638 |  |
| `aes-js` | ^3.1.2 | crypto-jwt | ✅ pass | 2 | 2 | 48107 | 548 |  |
| `bcryptjs` | ^2.4.3 | crypto-jwt | ✅ pass | 2 | 4 | 28384 | 1975 |  |
| `elliptic` | ^6.5.4 | crypto-jwt | ✅ pass | 2 | 4 | 145754 | 1942 |  |
| `hash.js` | ^1.1.7 | crypto-jwt | ✅ pass | 2 | 2 | 20774 | 411 |  |
| `jose` | ^5.9.0 | crypto-jwt | ✅ pass | 2 | 2 | 72127 | 1271 |  |
| `js-sha512` | ^0.9.0 | crypto-jwt | ✅ pass | 2 | 3 | 22940 | 787 |  |
| `jsrsasign` | ^11.1.0 | crypto-jwt | ✅ pass | 2 | 3 | 318785 | 7280 |  |
| `jssha` | ^3.3.1 | crypto-jwt | ✅ pass | 2 | 2 | 24487 | 643 |  |
| `node-forge` | ^1.3.1 | crypto-jwt | ✅ pass | 2 | 2 | 291049 | 4365 |  |
| `scrypt-js` | ^3.0.1 | crypto-jwt | ✅ pass | 2 | 2 | 9893 | 715 |  |
| `dateformat` | ^5.0.3 | datetime | ✅ pass | 2 | 2 | 7663 | 928 |  |
| `fecha` | ^4.2.3 | datetime | ✅ pass | 2 | 2 | 8844 | 259 |  |
| `humanize-duration` | ^3.31.0 | datetime | ✅ pass | 2 | 2 | 30389 | 353 |  |
| `moment` | ^2.30.0 | datetime | ✅ pass | 2 | 2 | 64199 | 1408 |  |
| `pretty-ms` | ^9.0.0 | datetime | ✅ pass | 2 | 2 | 5556 | 735 |  |
| `spacetime` | ^7.6.0 | datetime | ✅ pass | 2 | 2 | 53097 | 891 |  |
| `timeago.js` | ^4.0.0 | datetime | ✅ pass | 2 | 2 | 4426 | 1524 |  |
| `tinyduration` | ^3.3.0 | datetime | ✅ pass | 2 | 2 | 5390 | 820 |  |
| `@hattip/core` | ^0.0.49 | edge-frameworks | ✅ pass | 1 | 1 | 2022 | 1119 |  |
| `@hattip/router` | ^0.0.49 | edge-frameworks | ✅ pass | 2 | 2 | 4182 | 967 |  |
| `@tinyhttp/app` | ^2.5.1 | edge-frameworks | ✅ pass | 2 | 10 | 103733 | 2173 |  |
| `@whatwg-node/fetch` | ^0.10.1 | edge-frameworks | ✅ pass | 2 | 2 | 5369 | 1356 |  |
| `@whatwg-node/server` | ^0.9.60 | edge-frameworks | ✅ pass | 2 | 4 | 35644 | 1200 |  |
| `elysia` | ^1.1.24 | edge-frameworks | ✅ pass | 280 | 282 | 738030 | 33740 |  |
| `fets` | ^0.8.4 | edge-frameworks | ✅ pass | 2 | 4 | 228842 | 2895 |  |
| `h3` | ^1.13.0 | edge-frameworks | ✅ pass | 2 | 4 | 111618 | 1364 |  |
| `polka` | ^0.5.2 | edge-frameworks | ✅ pass | 2 | 4 | 10020 | 1366 |  |
| `sunder` | ^0.10.1 | edge-frameworks | ✅ pass | 2 | 3 | 31997 | 543 |  |
| `@kitajs/html` | ^4.2.9 | edge-html | ✅ pass | 2 | 2 | 7856 | 943 |  |
| `css-select` | ^5.1.0 | edge-html | ✅ pass | 4 | 4 | 200006 | 1994 |  |
| `dom-serializer` | ^2.0.0 | edge-html | ✅ pass | 4 | 4 | 171500 | 2351 |  |
| `domhandler` | ^5.0.3 | edge-html | ✅ pass | 4 | 4 | 96284 | 2613 |  |
| `hast-util-from-html` | ^2.0.3 | edge-html | ✅ pass | 2 | 2 | 223485 | 3713 |  |
| `hast-util-to-html` | ^9.0.4 | edge-html | ✅ pass | 4 | 4 | 57526 | 1126 |  |
| `hastscript` | ^9.0.0 | edge-html | ✅ pass | 2 | 2 | 23619 | 796 |  |
| `htmlparser2` | ^9.1.0 | edge-html | ✅ pass | 31 | 31 | 155818 | 13947 |  |
| `linkedom` | ^0.18.5 | edge-html | ✅ pass | 4 | 5 | 198322 | 2090 |  |
| `parse5` | ^7.2.1 | edge-html | ✅ pass | 2 | 2 | 184257 | 1331 |  |
| `ultrahtml` | ^1.5.3 | edge-html | ✅ pass | 2 | 2 | 8397 | 1070 |  |
| `xss` | ^1.0.15 | edge-html | ✅ pass | 2 | 2 | 21909 | 657 |  |
| `find-my-way` | ^9.0.0 | edge-routers | ✅ pass | 2 | 3 | 49701 | 831 |  |
| `hono` | ^4.6.0 | edge-routers | ✅ pass | 2 | 2 | 26664 | 898 |  |
| `hono/router` | ^4.6.0 | edge-routers | ✅ pass | 2 | 2 | 11246 | 573 |  |
| `itty-router` | ^5.0.0 | edge-routers | ✅ pass | 2 | 2 | 9254 | 325 |  |
| `memoirist` | ^0.3.0 | edge-routers | ✅ pass | 2 | 2 | 7321 | 334 |  |
| `radix3` | ^1.1.2 | edge-routers | ✅ pass | 2 | 2 | 6100 | 357 |  |
| `regexparam` | ^3.0.0 | edge-routers | ✅ pass | 2 | 2 | 3224 | 284 |  |
| `rou3` | ^0.5.0 | edge-routers | ✅ pass | 2 | 2 | 6990 | 614 |  |
| `trouter` | ^4.0.0 | edge-routers | ✅ pass | 2 | 2 | 4449 | 823 |  |
| `url-pattern` | ^1.0.3 | edge-routers | ✅ pass | 2 | 2 | 11122 | 933 |  |
| `worktop` | ^0.8.0-next.15 | edge-routers | ✅ pass | 2 | 2 | 5177 | 261 |  |
| `@react-email/render` | ^1.0.3 | email-html-render | ✅ pass | 11 | 11 | 649191 | 11982 |  |
| `cheerio-select` | ^2.1.0 | email-html-render | ✅ pass | 2 | 2 | 115272 | 1216 |  |
| `css` | ^3.0.0 | email-html-render | ✅ pass | 2 | 6 | 57073 | 1191 |  |
| `css-tree` | ^3.0.0 | email-html-render | ✅ pass | 2 | 2 | 205687 | 2337 |  |
| `css-what` | ^6.1.0 | email-html-render | ✅ pass | 2 | 2 | 9086 | 260 |  |
| `cssom` | ^0.5.0 | email-html-render | ✅ pass | 2 | 2 | 25458 | 740 |  |
| `domutils` | ^3.1.0 | email-html-render | ✅ pass | 2 | 2 | 91495 | 669 |  |
| `html-void-elements` | ^3.0.0 | email-html-render | ✅ pass | 2 | 2 | 2840 | 728 |  |
| `js-beautify` | ^1.15.1 | email-html-render | ✅ pass | 2 | 2 | 106171 | 1080 |  |
| `node-html-parser` | ^6.1.13 | email-html-render | ✅ pass | 0 | 0 | 1438 | 2 |  |
| `posthtml` | ^0.16.6 | email-html-render | ✅ pass | 2 | 2 | 187852 | 3047 |  |
| `specificity` | ^1.0.0 | email-html-render | ✅ pass | 2 | 2 | 175198 | 1993 |  |
| `stringify-entities` | ^4.0.4 | email-html-render | ✅ pass | 2 | 2 | 8775 | 372 |  |
| `base64-js` | ^1.5.1 | encoding-streams | ✅ pass | 2 | 2 | 5161 | 339 |  |
| `base64url` | ^3.0.1 | encoding-streams | ✅ pass | 2 | 3 | 9267 | 310 |  |
| `bytebuffer` | ^5.0.1 | encoding-streams | ✅ pass | 2 | 2 | 55786 | 995 |  |
| `fast-text-encoding` | ^1.0.6 | encoding-streams | ✅ pass | 2 | 3 | 11184 | 352 |  |
| `ieee754` | ^1.2.1 | encoding-streams | ✅ pass | 2 | 2 | 4781 | 718 |  |
| `js-base64` | ^3.7.7 | encoding-streams | ✅ pass | 2 | 3 | 11980 | 397 |  |
| `multiformats` | ^13.3.1 | encoding-streams | ✅ pass | 2 | 2 | 6077 | 223 |  |
| `text-encoding` | ^0.7.0 | encoding-streams | ✅ pass | 2 | 2 | 552587 | 6908 |  |
| `uint8arrays` | ^5.1.0 | encoding-streams | ✅ pass | 4 | 4 | 42871 | 1208 |  |
| `utf8` | ^3.0.0 | encoding-streams | ✅ pass | 2 | 2 | 5306 | 858 |  |
| `varint` | ^6.0.0 | encoding-streams | ✅ pass | 2 | 2 | 4639 | 371 |  |
| `web-streams-polyfill` | ^4.0.0 | encoding-streams | ✅ pass | 2 | 2 | 67025 | 6373 |  |
| `@vue/reactivity` | ^3.5.0 | frameworks-render | ✅ pass | 2 | 2 | 23976 | 1302 |  |
| `@vue/shared` | ^3.5.0 | frameworks-render | ✅ pass | 2 | 2 | 19130 | 1370 |  |
| `htm` | ^3.1.1 | frameworks-render | ✅ pass | 2 | 2 | 4078 | 508 |  |
| `hyperapp` | ^2.0.22 | frameworks-render | ✅ pass | 2 | 2 | 6297 | 1316 |  |
| `hyperscript-helpers` | ^3.0.3 | frameworks-render | ✅ pass | 2 | 2 | 5667 | 2052 |  |
| `mithril` | ^2.2.2 | frameworks-render | ✅ pass | 2 | 2 | 7006 | 415 |  |
| `nunjucks` | ^3.2.4 | frameworks-render | ✅ pass | 2 | 3 | 101099 | 1966 |  |
| `preact` | ^10.24.0 | frameworks-render | ✅ pass | 2 | 2 | 14575 | 6815 |  |
| `preact-render-to-string` | ^6.5.0 | frameworks-render | ✅ pass | 6 | 6 | 40071 | 4913 |  |
| `react` | ^18.3.1 | frameworks-render | ✅ pass | 2 | 2 | 11965 | 3822 |  |
| `vhtml` | ^2.2.0 | frameworks-render | ✅ pass | 2 | 2 | 3604 | 495 |  |
| `fp-ts` | ^2.16.0 | functional | ✅ pass | 4 | 4 | 20823 | 1893 |  |
| `immer` | ^10.0.0 | functional | ✅ pass | 2 | 2 | 17565 | 351 |  |
| `just-clone` | ^6.2.0 | functional | ✅ pass | 2 | 2 | 3558 | 305 |  |
| `just-group-by` | ^1.2.0 | functional | ✅ pass | 2 | 2 | 3338 | 244 |  |
| `just-omit` | ^2.2.0 | functional | ✅ pass | 2 | 2 | 3135 | 293 |  |
| `just-pick` | ^4.2.0 | functional | ✅ pass | 2 | 2 | 3115 | 296 |  |
| `moderndash` | ^4.0.0 | functional | ✅ pass | 2 | 2 | 16249 | 464 |  |
| `mout` | ^1.2.4 | functional | ✅ pass | 2 | 2 | 15223 | 353 |  |
| `radash` | ^12.0.0 | functional | ✅ pass | 2 | 2 | 19206 | 440 |  |
| `rambda` | ^9.0.0 | functional | ✅ pass | 2 | 2 | 38540 | 1301 |  |
| `rambdax` | ^11.0.0 | functional | ✅ pass | 2 | 2 | 54001 | 1739 |  |
| `ramda` | ^0.29.1 | functional | ✅ pass | 2 | 2 | 66038 | 1501 |  |
| `remeda` | ^2.0.0 | functional | ✅ pass | 2 | 2 | 33285 | 1378 |  |
| `dataloader` | ^2.2.2 | graphql | ✅ pass | 2 | 3 | 9671 | 457 |  |
| `gql-query-builder` | ^3.8.0 | graphql | ✅ pass | 2 | 2 | 19263 | 488 |  |
| `graphql` | ^16.8.1 | graphql | ✅ pass | 2 | 3 | 184917 | 2523 |  |
| `graphql (buildSchema + graphqlSync)` | ^16.8.1 | graphql | ✅ pass | 2 | 3 | 257190 | 4165 |  |
| `graphql-relay` | ^0.10.2 | graphql | ✅ pass | 4 | 5 | 199430 | 2444 |  |
| `graphql-request` | ^6.1.0 | graphql | ✅ pass | 5 | 6 | 208623 | 4827 |  |
| `graphql-request (v7)` | ^7.1.0 | graphql | ✅ pass | 4 | 5 | 196677 | 4103 |  |
| `graphql-scalars` | ^1.23.0 | graphql | ✅ pass | 4 | 6 | 310195 | 3034 |  |
| `graphql-tag` | ^2.12.6 | graphql | ✅ pass | 171 | 172 | 495281 | 26738 |  |
| `graphql-yoga` | ^5.3.0 | graphql | ✅ pass | 4 | 6 | 403418 | 4973 |  |
| `bs58` | ^6.0.0 | hash-crypto | ✅ pass | 2 | 2 | 4522 | 811 |  |
| `crc-32` | ^1.2.2 | hash-crypto | ✅ pass | 2 | 2 | 5572 | 200 |  |
| `crypto-js` | ^4.2.0 | hash-crypto | ✅ pass | 2 | 2 | 75990 | 1121 |  |
| `hash-sum` | ^2.0.0 | hash-crypto | ✅ pass | 2 | 2 | 4559 | 172 |  |
| `js-sha3` | ^0.9.3 | hash-crypto | ✅ pass | 2 | 3 | 14904 | 381 |  |
| `murmurhash` | ^2.0.1 | hash-crypto | ✅ pass | 2 | 2 | 5261 | 205 |  |
| `object-hash` | ^3.0.0 | hash-crypto | ✅ pass | 2 | 2 | 38394 | 1445 |  |
| `tweetnacl` | ^1.0.3 | hash-crypto | ✅ pass | 2 | 2 | 36737 | 1643 |  |
| `@notionhq/client` | ^2.2.15 | http-sdks | ✅ pass | 2 | 3 | 31374 | 2202 |  |
| `@octokit/core` | ^6.1.0 | http-sdks | ✅ pass | 2 | 3 | 21103 | 438 |  |
| `@sendgrid/mail` | ^8.1.0 | http-sdks | ✅ pass | 2 | 6 | 89938 | 1081 |  |
| `@slack/web-api` | ^7.5.0 | http-sdks | ✅ pass | 2 | 11 | 129058 | 2413 |  |
| `algoliasearch` | ^5.15.0 | http-sdks | ✅ pass | 2 | 2 | 99926 | 2075 |  |
| `octokit` | ^4.0.0 | http-sdks | ✅ pass | 2 | 4 | 191000 | 1535 |  |
| `postmark` | ^4.0.0 | http-sdks | ✅ pass | 2 | 4 | 102054 | 1138 |  |
| `resend` | ^4.0.0 | http-sdks | ✅ pass | 11 | 12 | 651543 | 9551 |  |
| `stripe` | ^17.0.0 | http-sdks | ✅ pass | 2 | 3 | 132371 | 1492 |  |
| `cross-fetch` | ^4.0.0 | http-url | ✅ pass | 2 | 2 | 14384 | 2767 |  |
| `is-url` | ^1.2.4 | http-url | ✅ pass | 2 | 2 | 3880 | 230 |  |
| `ky` | ^1.7.2 | http-url | ✅ pass | 2 | 2 | 21120 | 211 |  |
| `normalize-url` | ^8.0.1 | http-url | ✅ pass | 2 | 2 | 7751 | 223 |  |
| `parse-url` | ^9.2.0 | http-url | ✅ pass | 2 | 2 | 9263 | 4101 |  |
| `psl` | ^1.9.0 | http-url | ✅ pass | 2 | 2 | 163753 | 800 |  |
| `query-string` | ^9.1.0 | http-url | ✅ pass | 2 | 2 | 11798 | 323 |  |
| `querystringify` | ^2.2.0 | http-url | ✅ pass | 2 | 2 | 4524 | 2838 |  |
| `tldts` | ^6.1.0 | http-url | ✅ pass | 2 | 2 | 111082 | 3018 |  |
| `url-parse` | ^1.5.10 | http-url | ✅ pass | 2 | 2 | 9844 | 255 |  |
| `@msgpack/msgpack` | ^3.0.0-beta2 | ids-serialization | ✅ pass | 2 | 2 | 27588 | 1134 |  |
| `@paralleldrive/cuid2` | ^2.2.2 | ids-serialization | ✅ pass | 2 | 2 | 15320 | 476 |  |
| `borsh` | ^2.0.0 | ids-serialization | ✅ pass | 2 | 2 | 13464 | 267 |  |
| `cbor-x` | ^1.5.9 | ids-serialization | ✅ pass | 2 | 2 | 33659 | 802 |  |
| `ksuid` | ^3.0.0 | ids-serialization | ✅ pass | 2 | 5 | 14574 | 341 |  |
| `nanoid-dictionary` | ^4.3.0 | ids-serialization | ✅ pass | 2 | 2 | 4403 | 1350 |  |
| `short-uuid` | ^5.2.0 | ids-serialization | ✅ pass | 2 | 2 | 17627 | 798 |  |
| `typeid-js` | ^1.1.0 | ids-serialization | ✅ pass | 2 | 2 | 10396 | 267 |  |
| `ulid` | ^2.3.0 | ids-serialization | ✅ pass | 2 | 2 | 4748 | 165 |  |
| `ulidx` | ^2.4.1 | ids-serialization | ✅ pass | 0 | 0 | 1385 | 1 |  |
| `blurhash` | ^2.0.5 | image-binary | ✅ pass | 2 | 2 | 5892 | 687 |  |
| `exifr` | ^7.1.3 | image-binary | ✅ pass | 2 | 4 | 85616 | 1781 |  |
| `jpeg-js` | ^0.4.4 | image-binary | ✅ pass | 2 | 3 | 29080 | 524 |  |
| `jsqr` | ^1.4.0 | image-binary | ✅ pass | 2 | 2 | 134086 | 2027 |  |
| `qrcode` | ^1.5.4 | image-binary | ✅ pass | 2 | 2 | 28102 | 763 |  |
| `upng-js` | ^2.1.0 | image-binary | ✅ pass | 2 | 3 | 69342 | 1432 |  |
| `arr-diff` | ^4.0.0 | is-checks-glob | ✅ pass | 2 | 2 | 4155 | 296 |  |
| `array-union` | ^3.0.1 | is-checks-glob | ✅ pass | 2 | 2 | 3020 | 141 |  |
| `braces` | ^3.0.3 | is-checks-glob | ✅ pass | 2 | 3 | 20285 | 1120 |  |
| `is-arrayish` | ^0.3.2 | is-checks-glob | ✅ pass | 2 | 2 | 3947 | 221 |  |
| `is-buffer` | ^2.0.5 | is-checks-glob | ✅ pass | 2 | 2 | 3974 | 163 |  |
| `is-number` | ^7.0.0 | is-checks-glob | ✅ pass | 2 | 2 | 4034 | 189 |  |
| `is-plain-object` | ^5.0.0 | is-checks-glob | ✅ pass | 2 | 2 | 3150 | 2745 |  |
| `kind-of` | ^6.0.3 | is-checks-glob | ✅ pass | 2 | 2 | 5952 | 186 |  |
| `micromatch` | ^4.0.8 | is-checks-glob | ✅ pass | 2 | 5 | 47675 | 1040 |  |
| `minimatch` | ^9.0.5 | is-checks-glob | ✅ pass | 2 | 3 | 31705 | 597 |  |
| `picomatch` | ^4.0.2 | is-checks-glob | ✅ pass | 2 | 3 | 28676 | 507 |  |
| `type-detect` | ^4.0.8 | is-checks-glob | ✅ pass | 2 | 2 | 6218 | 183 |  |
| `deep-equal` | ^2.2.0 | json-data | ✅ pass | 2 | 3 | 56938 | 723 |  |
| `devalue` | ^5.1.0 | json-data | ✅ pass | 2 | 4 | 24584 | 339 |  |
| `dot-prop` | ^9.0.0 | json-data | ✅ pass | 2 | 2 | 5487 | 197 |  |
| `fast-json-stable-stringify` | ^2.1.0 | json-data | ✅ pass | 2 | 2 | 4854 | 172 |  |
| `flat` | ^6.0.0 | json-data | ✅ pass | 2 | 2 | 4136 | 253 |  |
| `flatted` | ^3.3.0 | json-data | ✅ pass | 2 | 2 | 3733 | 701 |  |
| `json-stable-stringify` | ^1.1.0 | json-data | ✅ pass | 2 | 2 | 27170 | 958 |  |
| `jsonpath-plus` | ^10.0.0 | json-data | ✅ pass | 2 | 2 | 28138 | 446 |  |
| `object-path` | ^0.11.8 | json-data | ✅ pass | 2 | 2 | 6891 | 336 |  |
| `safe-stable-stringify` | ^2.5.0 | json-data | ✅ pass | 2 | 2 | 11435 | 715 |  |
| `sort-keys` | ^5.0.0 | json-data | ✅ pass | 2 | 2 | 3707 | 326 |  |
| `superjson` | ^2.2.0 | json-data | ✅ pass | 2 | 2 | 15268 | 209 |  |
| `@asteasolutions/zod-to-openapi` | ^7.3.0 | json-schema-openapi | ✅ pass | 2 | 2 | 29394 | 1001 |  |
| `@exodus/schemasafe` | ^1.3.0 | json-schema-openapi | ✅ pass | 2 | 3 | 64657 | 1867 |  |
| `@hyperjump/json-schema` | ^1.13.0 | json-schema-openapi | ✅ pass | 14 | 14 | 91884 | 4759 |  |
| `@readme/openapi-parser` | ^2.6.0 | json-schema-openapi | ✅ pass | 2 | 9 | 358876 | 3904 |  |
| `ajv-formats` | ^3.0.1 | json-schema-openapi | ✅ pass | 14 | 14 | 283637 | 6423 |  |
| `better-ajv-errors` | ^1.2.0 | json-schema-openapi | ✅ pass | 2 | 3 | 59348 | 1550 |  |
| `djv` | ^2.1.4 | json-schema-openapi | ✅ pass | 4 | 4 | 38271 | 1132 |  |
| `json-schema-to-ts` | ^3.1.1 | json-schema-openapi | ✅ pass | 2 | 2 | 3195 | 203 |  |
| `openapi3-ts` | ^4.4.0 | json-schema-openapi | ✅ pass | 2 | 2 | 60143 | 1303 |  |
| `@noble/ciphers` | ^1.0.0 | jwt-noble-crypto | ✅ pass | 6 | 6 | 35036 | 1073 |  |
| `@noble/curves` | ^1.6.0 | jwt-noble-crypto | ✅ pass | 2 | 2 | 47557 | 734 |  |
| `@noble/ed25519` | ^2.1.0 | jwt-noble-crypto | ✅ pass | 2 | 2 | 11287 | 417 |  |
| `@noble/hashes` | ^1.5.0 | jwt-noble-crypto | ✅ pass | 4 | 4 | 13848 | 396 |  |
| `@noble/secp256k1` | ^2.1.0 | jwt-noble-crypto | ✅ pass | 2 | 2 | 12466 | 1583 |  |
| `@tsndr/cloudflare-worker-jwt` | ^2.5.3 | jwt-noble-crypto | ✅ pass | 2 | 2 | 8115 | 813 |  |
| `jwt-decode` | ^4.0.0 | jwt-noble-crypto | ✅ pass | 2 | 2 | 3562 | 141 |  |
| `oslo` | ^1.2.0 | jwt-noble-crypto | ✅ pass | 2 | 2 | 8143 | 297 |  |
| `uuidv7` | ^1.0.2 | jwt-noble-crypto | ✅ pass | 2 | 2 | 7740 | 339 |  |
| `lodash.clonedeep` | ^4.5.0 | lodash-split | ✅ pass | 2 | 2 | 13358 | 601 |  |
| `lodash.debounce` | ^4.0.8 | lodash-split | ✅ pass | 2 | 2 | 5537 | 519 |  |
| `lodash.defaults` | ^4.2.0 | lodash-split | ✅ pass | 2 | 2 | 6296 | 395 |  |
| `lodash.get` | ^4.4.2 | lodash-split | ✅ pass | 2 | 2 | 8791 | 973 |  |
| `lodash.groupby` | ^4.6.0 | lodash-split | ✅ pass | 2 | 2 | 16630 | 638 |  |
| `lodash.isequal` | ^4.5.0 | lodash-split | ✅ pass | 2 | 2 | 14502 | 868 |  |
| `lodash.merge` | ^4.6.2 | lodash-split | ✅ pass | 2 | 2 | 14374 | 982 |  |
| `lodash.omit` | ^4.5.0 | lodash-split | ✅ pass | 2 | 2 | 18748 | 387 |  |
| `lodash.pick` | ^4.4.0 | lodash-split | ✅ pass | 2 | 2 | 5728 | 272 |  |
| `lodash.set` | ^4.3.2 | lodash-split | ✅ pass | 2 | 2 | 9141 | 529 |  |
| `lodash.throttle` | ^4.1.1 | lodash-split | ✅ pass | 2 | 2 | 5735 | 421 |  |
| `lodash.uniq` | ^4.5.0 | lodash-split | ✅ pass | 2 | 2 | 8596 | 421 |  |
| `ansi-colors` | ^4.1.3 | logging-color | ✅ pass | 2 | 3 | 10147 | 308 |  |
| `chalk` | ^5.3.0 | logging-color | ✅ pass | 2 | 2 | 8457 | 282 |  |
| `cli-color` | ^2.0.4 | logging-color | ✅ pass | 2 | 3 | 57695 | 1727 |  |
| `colorette` | ^2.0.20 | logging-color | ✅ pass | 2 | 4 | 7412 | 219 |  |
| `debug` | ^4.3.7 | logging-color | ✅ pass | 2 | 3 | 11194 | 350 |  |
| `kleur` | ^4.1.5 | logging-color | ✅ pass | 2 | 3 | 5944 | 254 |  |
| `loglevel` | ^1.9.2 | logging-color | ✅ pass | 2 | 2 | 6961 | 293 |  |
| `picocolors` | ^1.1.1 | logging-color | ✅ pass | 2 | 2 | 5749 | 422 |  |
| `entities` | ^4.5.0 | markdown-html | ✅ pass | 2 | 2 | 81718 | 1264 |  |
| `gray-matter` | ^4.0.3 | markdown-html | ✅ pass | 2 | 3 | 60161 | 1278 |  |
| `html-entities` | ^2.5.2 | markdown-html | ✅ pass | 2 | 2 | 39182 | 846 |  |
| `html-to-text` | ^9.0.5 | markdown-html | ✅ pass | 2 | 2 | 154784 | 4684 |  |
| `linkify-it` | ^5.0.0 | markdown-html | ✅ pass | 2 | 2 | 14501 | 1196 |  |
| `remove-markdown` | ^0.5.0 | markdown-html | ✅ pass | 2 | 2 | 5614 | 939 |  |
| `sanitize-html` | ^2.13.0 | markdown-html | ✅ pass | 2 | 7 | 206261 | 3793 |  |
| `striptags` | ^3.2.0 | markdown-html | ✅ pass | 2 | 2 | 5230 | 779 |  |
| `hast-util-sanitize` | ^5.0.2 | markdown-unified | ✅ pass | 2 | 2 | 11029 | 310 |  |
| `mdast-util-to-string` | ^4.0.0 | markdown-unified | ✅ pass | 2 | 2 | 3265 | 340 |  |
| `unified` | ^11.0.5 | markdown-unified | ✅ pass | 2 | 2 | 16366 | 549 |  |
| `axios` | ^1.7.0 | node-shimmed | ✅ pass | 2 | 4 | 55362 | 1773 |  |
| `content-type` | ^1.0.5 | node-shimmed | ✅ pass | 2 | 2 | 5870 | 192 |  |
| `cookie` | ^0.6.0 | node-shimmed | ✅ pass | 2 | 2 | 6194 | 191 |  |
| `form-data` | ^4.0.0 | node-shimmed | ✅ pass | 2 | 12 | 183218 | 1238 |  |
| `media-typer` | ^1.1.0 | node-shimmed | ✅ pass | 2 | 2 | 5112 | 199 |  |
| `mime` | ^3.0.0 | node-shimmed | ✅ pass | 2 | 2 | 40177 | 390 |  |
| `mime-types` | ^2.1.35 | node-shimmed | ✅ pass | 2 | 3 | 144953 | 928 |  |
| `path-browserify` | ^1.0.1 | node-shimmed | ✅ pass | 2 | 3 | 9603 | 951 |  |
| `punycode` | ^2.3.1 | node-shimmed | ✅ pass | 2 | 2 | 5417 | 443 |  |
| `set-cookie-parser` | ^2.6.0 | node-shimmed | ✅ pass | 2 | 2 | 6366 | 194 |  |
| `statuses` | ^2.0.1 | node-shimmed | ✅ pass | 2 | 2 | 6215 | 1614 |  |
| `big.js` | ^6.2.1 | number | ✅ pass | 2 | 2 | 9678 | 1613 |  |
| `accounting` | ^0.4.1 | numbers | ✅ pass | 2 | 2 | 7203 | 268 |  |
| `bignumber.js` | ^9.1.0 | numbers | ✅ pass | 2 | 2 | 22505 | 976 |  |
| `currency.js` | ^2.0.4 | numbers | ✅ pass | 2 | 2 | 5955 | 215 |  |
| `d3-format` | ^3.1.0 | numbers | ✅ pass | 2 | 2 | 7663 | 237 |  |
| `decimal.js` | ^10.4.0 | numbers | ✅ pass | 2 | 2 | 35243 | 765 |  |
| `expr-eval` | ^2.0.2 | numbers | ✅ pass | 2 | 2 | 28738 | 541 |  |
| `fraction.js` | ^4.3.0 | numbers | ✅ pass | 2 | 2 | 8756 | 697 |  |
| `js-big-decimal` | ^2.0.7 | numbers | ✅ pass | 2 | 2 | 12424 | 407 |  |
| `numbro` | ^2.5.0 | numbers | ✅ pass | 2 | 2 | 43759 | 712 |  |
| `numeral` | ^2.0.6 | numbers | ✅ pass | 2 | 2 | 15142 | 366 |  |
| `deepmerge` | ^4.3.1 | object | ✅ pass | 2 | 2 | 5253 | 235 |  |
| `fast-deep-equal` | ^3.1.3 | object | ✅ pass | 2 | 2 | 4460 | 165 |  |
| `@iarna/toml` | ^2.2.5 | parsing | ✅ pass | 2 | 4 | 49332 | 585 |  |
| `csv-parse` | ^5.5.0 | parsing | ✅ pass | 2 | 3 | 35493 | 281 |  |
| `fast-xml-parser` | ^4.3.0 | parsing | ✅ pass | 2 | 2 | 39290 | 612 |  |
| `front-matter` | ^4.0.2 | parsing | ✅ pass | 2 | 3 | 47290 | 2040 |  |
| `ini` | ^4.1.0 | parsing | ✅ pass | 2 | 3 | 8440 | 192 |  |
| `json5` | ^2.2.3 | parsing | ✅ pass | 2 | 2 | 35408 | 1474 |  |
| `markdown-it` | ^14.0.0 | parsing | ✅ pass | 2 | 2 | 151313 | 1779 |  |
| `papaparse` | ^5.4.0 | parsing | ✅ pass | 2 | 2 | 23255 | 423 |  |
| `smol-toml` | ^1.1.4 | parsing | ✅ pass | 2 | 2 | 17245 | 318 |  |
| `toml` | ^3.0.0 | parsing | ✅ pass | 2 | 2 | 31544 | 1230 |  |
| `yaml` | ^2.3.0 | parsing | ✅ pass | 27 | 27 | 147518 | 4432 |  |
| `qs` | ^6.11.0 | querystring | ✅ pass | 2 | 2 | 46266 | 681 |  |
| `@isaacs/ttlcache` | ^1.4.1 | rate-limit-state | ✅ pass | 2 | 3 | 9215 | 1218 |  |
| `bottleneck` | ^2.19.5 | rate-limit-state | ✅ pass | 2 | 2 | 64362 | 3793 |  |
| `croner` | ^8.1.2 | rate-limit-state | ✅ pass | 2 | 2 | 22007 | 1024 |  |
| `jotai` | ^2.10.3 | rate-limit-state | ✅ pass | 2 | 2 | 11193 | 366 |  |
| `limiter` | ^2.1.0 | rate-limit-state | ✅ pass | 2 | 2 | 5840 | 3421 |  |
| `nanostores` | ^0.11.3 | rate-limit-state | ✅ pass | 2 | 2 | 7285 | 658 |  |
| `p-throttle` | ^6.2.0 | rate-limit-state | ✅ pass | 2 | 2 | 4598 | 1567 |  |
| `toad-cache` | ^3.7.0 | rate-limit-state | ✅ pass | 2 | 2 | 11901 | 378 |  |
| `valtio` | ^2.1.2 | rate-limit-state | ✅ pass | 2 | 2 | 6897 | 1003 |  |
| `zustand` | ^5.0.2 | rate-limit-state | ✅ pass | 2 | 2 | 3093 | 299 |  |
| `@mobily/ts-belt` | ^3.13.1 | result-fp | ✅ pass | 2 | 2 | 59708 | 1120 |  |
| `fp-ts-std` | ^1.0.0 | result-fp | ✅ pass | 30 | 30 | 140365 | 7232 |  |
| `monet` | ^0.9.3 | result-fp | ✅ pass | 2 | 2 | 24376 | 472 |  |
| `neverthrow` | ^8.1.0 | result-fp | ✅ pass | 2 | 2 | 9747 | 421 |  |
| `option-t` | ^56.1.0 | result-fp | ✅ pass | 2 | 2 | 7152 | 1708 |  |
| `oxide.ts` | ^1.1.0 | result-fp | ✅ pass | 2 | 2 | 10883 | 419 |  |
| `purify-ts` | ^2.1.0 | result-fp | ✅ pass | 2 | 2 | 26412 | 1069 |  |
| `true-myth` | ^8.5.0 | result-fp | ✅ pass | 2 | 2 | 14327 | 908 |  |
| `ts-option` | ^2.1.0 | result-fp | ✅ pass | 2 | 2 | 7713 | 332 |  |
| `ts-pattern` | ^5.5.0 | result-fp | ✅ pass | 2 | 2 | 10818 | 398 |  |
| `ts-results` | ^3.3.0 | result-fp | ✅ pass | 2 | 2 | 7094 | 879 |  |
| `@libsql/client` | ^0.14.0 | serverless-db | ✅ pass | 2 | 3 | 83695 | 1287 |  |
| `@neondatabase/serverless` | ^0.9.4 | serverless-db | ✅ pass | 2 | 4 | 149522 | 3432 |  |
| `@planetscale/database` | ^1.19.0 | serverless-db | ✅ pass | 2 | 2 | 9079 | 2254 |  |
| `@upstash/ratelimit` | ^2.0.5 | serverless-db | ✅ pass | 2 | 2 | 40841 | 2861 |  |
| `@upstash/redis` | ^1.34.3 | serverless-db | ✅ pass | 2 | 4 | 91926 | 2832 |  |
| `@vercel/postgres` | ^0.10.0 | serverless-db | ✅ pass | 2 | 4 | 153208 | 3229 |  |
| `drizzle-orm` | ^0.36.4 | serverless-db | ✅ pass | 36 | 50 | 336768 | 14381 |  |
| `ioredis` | ^5.4.1 | serverless-db | ✅ pass | 2 | 16 | 171625 | 1715 |  |
| `kysely` | ^0.27.4 | serverless-db | ✅ pass | 2 | 3 | 194751 | 2816 |  |
| `postgres` | ^3.4.5 | serverless-db | ✅ pass | 2 | 11 | 52015 | 629 |  |
| `sql-template-tag` | ^5.2.0 | serverless-db | ✅ pass | 2 | 2 | 4916 | 888 |  |
| `@microsoft/fetch-event-source` | ^2.0.1 | streaming-sse-iter | ✅ pass | 2 | 2 | 6196 | 312 |  |
| `event-iterator` | ^2.0.0 | streaming-sse-iter | ✅ pass | 2 | 2 | 6087 | 398 |  |
| `eventsource-parser` | ^3.0.0 | streaming-sse-iter | ✅ pass | 2 | 2 | 6183 | 274 |  |
| `eventsource-parser/stream` | ^3.0.0 | streaming-sse-iter | ✅ pass | 2 | 2 | 6417 | 204 |  |
| `it-all` | ^3.0.0 | streaming-sse-iter | ✅ pass | 2 | 2 | 3219 | 248 |  |
| `it-map` | ^3.1.0 | streaming-sse-iter | ✅ pass | 4 | 4 | 5358 | 633 |  |
| `it-pipe` | ^3.0.1 | streaming-sse-iter | ✅ pass | 4 | 4 | 11807 | 416 |  |
| `it-pushable` | ^3.2.3 | streaming-sse-iter | ✅ pass | 2 | 2 | 7060 | 282 |  |
| `its-fine` | ^1.2.5 | streaming-sse-iter | ✅ pass | 4 | 4 | 17982 | 938 |  |
| `p-event` | ^6.0.1 | streaming-sse-iter | ✅ pass | 2 | 2 | 7484 | 210 |  |
| `streaming-iterables` | ^8.0.1 | streaming-sse-iter | ✅ pass | 2 | 3 | 13481 | 465 |  |
| `yield-stream` | ^3.0.0 | streaming-sse-iter | ✅ pass | 2 | 2 | 3911 | 559 |  |
| `escape-string-regexp` | ^5.0.0 | string | ✅ pass | 2 | 2 | 3275 | 186 |  |
| `he` | ^1.2.0 | string | ✅ pass | 2 | 2 | 90756 | 1700 |  |
| `indent-string` | ^5.0.0 | string | ✅ pass | 2 | 2 | 3553 | 330 |  |
| `no-case` | ^3.0.4 | string | ✅ pass | 2 | 2 | 3009 | 347 |  |
| `pluralize` | ^8.0.0 | string | ✅ pass | 2 | 2 | 9695 | 1319 |  |
| `string-hash` | ^1.1.3 | string | ✅ pass | 2 | 2 | 3764 | 455 |  |
| `voca` | ^1.4.1 | string | ✅ pass | 2 | 2 | 26285 | 617 |  |
| `word-wrap` | ^1.2.5 | string | ✅ pass | 2 | 2 | 4519 | 205 |  |
| `dot` | ^1.1.3 | templating | ✅ pass | 2 | 2 | 7148 | 439 |  |
| `ejs` | ^3.1.10 | templating | ✅ pass | 2 | 4 | 19533 | 1373 |  |
| `eta` | ^3.4.0 | templating | ✅ pass | 2 | 2 | 12526 | 593 |  |
| `handlebars` | ^4.7.8 | templating | ✅ pass | 2 | 2 | 108912 | 1606 |  |
| `lodash.template` | ^4.5.0 | templating | ✅ pass | 2 | 2 | 14180 | 388 |  |
| `micromustache` | ^8.0.3 | templating | ✅ pass | 2 | 2 | 8251 | 386 |  |
| `mustache` | ^4.2.0 | templating | ✅ pass | 2 | 2 | 9507 | 248 |  |
| `squirrelly` | ^9.1.0 | templating | ✅ pass | 2 | 2 | 13885 | 1701 |  |
| `underscore` | ^1.13.6 | templating | ✅ pass | 2 | 2 | 26538 | 598 |  |
| `@formkit/tempo` | ^1.1.0 | temporal-datetime | ✅ pass | 2 | 2 | 22917 | 1230 |  |
| `chrono-node` | ^2.7.7 | temporal-datetime | ✅ pass | 2 | 2 | 198871 | 1956 |  |
| `date-fns` | ^3.6.0 | temporal-datetime | ✅ pass | 0 | 0 | 1447 | 2 |  |
| `dayjs` | ^1.11.13 | temporal-datetime | ✅ pass | 0 | 0 | 1528 | 1 |  |
| `tinydate` | ^1.3.0 | temporal-datetime | ✅ pass | 2 | 2 | 3490 | 261 |  |
| `tinydate (time tokens)` | ^1.3.0 | temporal-datetime | ✅ pass | 2 | 2 | 3470 | 315 |  |
| `ms` | ^2.1.3 | time | ✅ pass | 2 | 2 | 4802 | 1959 |  |
| `@trpc/server` | ^11.0.0 | trpc-rpc-serialize | ✅ pass | 2 | 3 | 22375 | 682 |  |
| `@ungap/structured-clone` | ^1.2.1 | trpc-rpc-serialize | ✅ pass | 2 | 2 | 6057 | 222 |  |
| `base-x` | ^5.0.0 | trpc-rpc-serialize | ✅ pass | 2 | 2 | 4559 | 177 |  |
| `base32-encode` | ^2.0.0 | trpc-rpc-serialize | ✅ pass | 2 | 2 | 3873 | 421 |  |
| `base64-arraybuffer` | ^1.0.2 | trpc-rpc-serialize | ✅ pass | 2 | 2 | 3590 | 170 |  |
| `cbor2` | ^1.6.0 | trpc-rpc-serialize | ✅ pass | 2 | 2 | 41200 | 855 |  |
| `hi-base32` | ^0.5.1 | trpc-rpc-serialize | ✅ pass | 2 | 3 | 11525 | 383 |  |
| `rfc4648` | ^1.5.4 | trpc-rpc-serialize | ✅ pass | 2 | 2 | 4438 | 509 |  |
| `seroval` | ^1.1.1 | trpc-rpc-serialize | ✅ pass | 2 | 2 | 43363 | 1396 |  |
| `structured-clone` | ^0.2.2 | trpc-rpc-serialize | ✅ pass | 2 | 3 | 11573 | 577 |  |
| `turbo-stream` | ^2.4.0 | trpc-rpc-serialize | ✅ pass | 2 | 2 | 10805 | 1430 |  |
| `classnames` | ^2.5.1 | ui | ✅ pass | 2 | 2 | 4574 | 1462 |  |
| `destr` | ^2.0.3 | unjs-utils | ✅ pass | 2 | 2 | 4288 | 255 |  |
| `hookable` | ^5.5.3 | unjs-utils | ✅ pass | 2 | 2 | 6699 | 277 |  |
| `nanotar` | ^0.1.1 | unjs-utils | ✅ pass | 2 | 2 | 7289 | 386 |  |
| `ofetch` | ^1.4.1 | unjs-utils | ✅ pass | 2 | 2 | 14436 | 335 |  |
| `ohash` | ^1.1.4 | unjs-utils | ✅ pass | 2 | 3 | 18866 | 347 |  |
| `pathe` | ^1.1.2 | unjs-utils | ✅ pass | 2 | 3 | 7243 | 190 |  |
| `perfect-debounce` | ^1.0.0 | unjs-utils | ✅ pass | 2 | 2 | 3193 | 169 |  |
| `scule` | ^1.3.0 | unjs-utils | ✅ pass | 2 | 2 | 4831 | 280 |  |
| `std-env` | ^3.7.2 | unjs-utils | ✅ pass | 2 | 3 | 9829 | 283 |  |
| `ufo` | ^1.5.4 | unjs-utils | ✅ pass | 2 | 2 | 14394 | 299 |  |
| `unctx` | ^2.3.1 | unjs-utils | ✅ pass | 2 | 2 | 4093 | 233 |  |
| `unstorage` | ^1.11.1 | unjs-utils | ✅ pass | 2 | 3 | 19941 | 461 |  |
| `@sinclair/typebox` | ^0.33.0 | validation | ✅ pass | 4 | 4 | 128664 | 3665 |  |
| `ajv` | ^8.17.0 | validation | ✅ pass | 2 | 2 | 122086 | 2597 |  |
| `class-validator` | ^0.14.1 | validation | ✅ pass | 2 | 2 | 394147 | 5275 |  |
| `email-validator` | ^2.0.4 | validation | ✅ pass | 2 | 2 | 4051 | 2051 |  |
| `fastest-validator` | ^1.19.0 | validation | ✅ pass | 2 | 2 | 49646 | 1851 |  |
| `joi` | ^17.13.0 | validation | ✅ pass | 2 | 2 | 151277 | 3218 |  |
| `superstruct` | ^2.0.2 | validation | ✅ pass | 2 | 2 | 13875 | 3028 |  |
| `validate.js` | ^0.13.1 | validation | ✅ pass | 2 | 2 | 18301 | 1825 |  |
| `validator` | ^13.11.0 | validation | ✅ pass | 2 | 2 | 135862 | 1843 |  |
| `yup` | ^1.4.0 | validation | ✅ pass | 2 | 2 | 48824 | 1561 |  |
| `@badrap/valita` | ^0.4.0 | validation-edge | ✅ pass | 2 | 2 | 18413 | 2045 |  |
| `@hono/zod-validator` | ^0.4.0 | validation-edge | ✅ pass | 16 | 16 | 93161 | 2440 |  |
| `banditypes` | ^0.2.0 | validation-edge | ✅ pass | 2 | 2 | 4251 | 656 |  |
| `io-ts` | ^2.2.21 | validation-edge | ✅ pass | 4 | 4 | 39072 | 3264 |  |
| `runtypes` | ^6.7.0 | validation-edge | ✅ pass | 2 | 2 | 36581 | 2264 |  |
| `typanion` | ^3.14.0 | validation-edge | ✅ pass | 2 | 2 | 25640 | 914 |  |
| `accepts` | ^1.3.8 | worker-utils-misc | ✅ pass | 2 | 3 | 153063 | 1182 |  |
| `compressible` | ^2.0.18 | worker-utils-misc | ✅ pass | 2 | 2 | 154499 | 1819 |  |
| `fresh` | ^0.5.2 | worker-utils-misc | ✅ pass | 2 | 2 | 4572 | 942 |  |
| `mime-db` | ^1.52.0 | worker-utils-misc | ✅ pass | 2 | 2 | 153860 | 1176 |  |
| `negotiator` | ^0.6.3 | worker-utils-misc | ✅ pass | 2 | 2 | 10761 | 1307 |  |
| `range-parser` | ^1.2.1 | worker-utils-misc | ✅ pass | 2 | 2 | 4963 | 210 |  |
| `type-is` | ^1.6.18 | worker-utils-misc | ✅ pass | 2 | 3 | 148529 | 1092 |  |
| `unenv` | ^1.10.0 | worker-utils-misc | ✅ pass | 2 | 3 | 6562 | 1025 |  |
| `vary` | ^1.1.2 | worker-utils-misc | ✅ pass | 2 | 2 | 4962 | 264 |  |
| `zod-to-json-schema` | ^3.23.0 | validation-edge | wrong_output | 4 | 4 | 95160 | 1004 | stdout: OK:false |
| `string-length` | ^6.0.0 | ansi-string | runtime_error | 2 | 2 | 3560 | 188 | THREW:ReferenceError: Intl is not defined |
| `cookie-signature` | ^1.2.2 | auth-oauth | runtime_error | 2 | 4 | 10705 | 209 | THREW:TypeError: a.createHmac is not a function |
| `grant` | ^5.4.23 | auth-oauth | runtime_error | 38 | 49 | 393758 | 10312 | THREW:TypeError: f.prototype is not an object or null |
| `iron-webcrypto` | ^1.2.1 | auth-oauth | runtime_error | 2 | 2 | 9637 | 414 | NotSupportedError: Supplied algorithm is not yet supported |
| `jwt-simple` | ^0.5.6 | auth-oauth | runtime_error | 2 | 4 | 12037 | 312 | THREW:TypeError: p.createHmac is not a function |
| `merge-deep` | ^3.0.3 | clone-lru | runtime_error | 2 | 3 | 9597 | 369 | THREW:Error: module not found: 'kind-of'. The sandbox only bundles a fixed set of modules: cheerio, node-html-parser, zod, js-yaml, nanoid, ulidx, uuid, lodash, date-fns, dayjs, @spinframework/spin-kv |
| `jsonwebtoken` | ^9.0.2 | crypto-jwt | runtime_error | 2 | 7 | 70491 | 2240 | THREW:TypeError: N.prototype is not an object or null |
| `jws` | ^4.0.0 | crypto-jwt | runtime_error | 2 | 7 | 25149 | 1655 | THREW:TypeError: S.prototype is not an object or null |
| `date-fns-tz` | ^3.2.0 | datetime | runtime_error | 272 | 272 | 398519 | 22744 | THREW:ReferenceError: Intl is not defined |
| `luxon` | ^3.4.0 | datetime | runtime_error | 2 | 2 | 74525 | 955 | THREW:ReferenceError: Intl is not defined |
| `juice` | ^8.1.0 | email-html-render | runtime_error | 2 | 4 | 392179 | 6126 | THREW:TypeError: F0.Document is not a constructor |
| `juice-11-note` | ^11.0.0 | email-html-render | runtime_error | 6 | 11 | 497649 | 12134 | THREW:TypeError: can't access property "EntityDecoder", _decodetargetes2020 is null |
| `react-dom` | ^18.3.1 | frameworks-render | runtime_error | 5 | 5 | 96521 | 1641 | THREW:Error: Minified React error #31; visit https://reactjs.org/docs/error-decoder.html?invariant=31&args[]=object%20with%20keys%20%7B%24%24typeof%2C%20type%2C%20key%2C%20ref%2C%20props%7D for the full message or use the non-minified dev environment for full errors and additional helpful warnings. |
| `@graphql-tools/schema` | ^10.0.3 | graphql | runtime_error | 173 | 174 | 825179 | 28703 | Nn@build/precompiled-source.js line 643 > AsyncFunction:1152:8829 |
| `js-md5` | ^0.8.3 | hash-crypto | runtime_error | 2 | 3 | 15644 | 355 | THREW:TypeError: can't access property "from", e is undefined |
| `js-sha1` | ^0.7.0 | hash-crypto | runtime_error | 2 | 3 | 12936 | 484 | THREW:TypeError: can't access property "from", f is undefined |
| `js-sha256` | ^0.11.0 | hash-crypto | runtime_error | 2 | 3 | 14466 | 316 | THREW:TypeError: can't access property "from", i is undefined |
| `sha.js` | ^2.4.11 | hash-crypto | runtime_error | 2 | 3 | 42830 | 580 | THREW:TypeError: E.prototype is not an object or null |
| `mailgun.js` | ^10.2.0 | http-sdks | runtime_error | 2 | 4 | 168926 | 2858 | THREW:ReferenceError: define is not defined |
| `node-fetch` | ^3.3.2 | http-url | runtime_error | 2 | 15 | 115503 | 1577 | THREW:TypeError: can't access property "promisify", _utilmjs is null |
| `whatwg-url` | ^14.0.0 | http-url | runtime_error | 2 | 2 | 294190 | 4730 | THREW:TypeError: t.normalize is not a function |
| `hyperid` | ^3.3.0 | ids-serialization | runtime_error | 2 | 3 | 43492 | 783 | THREW:SyntaxError: unexpected incomplete base64 chunk |
| `msgpackr` | ^1.10.2 | ids-serialization | runtime_error | 2 | 3 | 37483 | 1226 | THREW:TypeError: can't access property "utf8Write", ot.prototype is undefined |
| `file-type` | ^19.6.0 | image-binary | runtime_error | 2 | 2 | 39970 | 1139 | f@build/precompiled-source.js line 643 > AsyncFunction:16:5242 |
| `png-js` | ^1.0.0 | image-binary | runtime_error | 2 | 7 | 71358 | 2213 | THREW:TypeError: can't access property "toString", Wt is undefined |
| `pngjs` | ^7.0.0 | image-binary | runtime_error | 2 | 8 | 44773 | 2140 | THREW:TypeError: superCtor.prototype is not an object or null |
| `sharp` | ^0.33.5 | image-binary | runtime_error | 2 | 12 | 132745 | 2977 | THREW:Error: Could not load the "sharp" module using the wasi-wasm32 runtime |
| `ajv-errors` | ^3.0.0 | json-schema-openapi | runtime_error | 22 | 22 | 387581 | 10085 | THREW:SyntaxError: unexpected token: ':' |
| `@panva/hkdf` | ^1.2.1 | jwt-noble-crypto | runtime_error | 2 | 2 | 4361 | 786 | NotSupportedError: Supplied algorithm is not yet supported |
| `fast-jwt` | ^4.0.5 | jwt-noble-crypto | runtime_error | 2 | 5 | 111675 | 1559 | THREW:TypeError: Jt(...).constants is undefined |
| `hash-wasm` | ^4.11.0 | jwt-noble-crypto | runtime_error | 2 | 2 | 219210 | 1990 | D/<@build/precompiled-source.js line 643 > AsyncFunction:16:4970 |
| `supports-color` | ^9.4.0 | logging-color | runtime_error | 2 | 2 | 3907 | 282 | THREW:ReferenceError: navigator is not defined |
| `turndown` | ^7.1.2 | markdown-html | runtime_error | 2 | 2 | 14055 | 1090 | THREW:TypeError: r.createDocument is not a function |
| `xml2js` | ^0.6.2 | parsing | runtime_error | 2 | 6 | 113846 | 1648 | THREW:TypeError: can't access property "reset", this is null |
| `@sindresorhus/is` | ^7.0.1 | rate-limit-state | runtime_error | 2 | 2 | 31018 | 390 | THREW:ReferenceError: Intl is not defined |
| `cron-parser` | ^4.9.0 | rate-limit-state | runtime_error | 2 | 2 | 92115 | 4167 | THREW:ReferenceError: Intl is not defined |
| `slugify` | ^1.6.6 | string | runtime_error | 2 | 2 | 14312 | 1523 | THREW:TypeError: u.normalize is not a function |
| `art-template` | ^4.13.2 | templating | runtime_error | 2 | 10 | 323198 | 4260 | THREW:TypeError: can't access property ".art", Z.extensions is undefined |
| `@date-fns/utc` | ^2.0.0 | temporal-datetime | runtime_error | 2 | 2 | 3837 | 312 | THREW:ReferenceError: Intl is not defined |
| `@formkit/tempo (format)` | ^1.1.0 | temporal-datetime | runtime_error | 2 | 2 | 22874 | 550 | THREW:ReferenceError: Intl is not defined |
| `dayjs-plugin-relativeTime` | (dayjs subpath) | temporal-datetime | runtime_error | 0 | 0 | 1707 | 2 | THREW:Error: module not found: 'dayjs/plugin/relativeTime'. The sandbox only bundles a fixed set of modules: cheerio, node-html-parser, zod, js-yaml, nanoid, ulidx, uuid, lodash, date-fns, dayjs, @spinframework/spin-kv |
| `temporal-polyfill` | ^0.2.5 | temporal-datetime | runtime_error | 2 | 2 | 63515 | 3481 | THREW:ReferenceError: Intl is not defined |
| `is-my-json-valid` | ^2.20.6 | validation | runtime_error | 2 | 3 | 33005 | 2104 | THREW:SyntaxError: expected expression, got '%' |
| `ow` | ^2.0.0 | validation | runtime_error | 2 | 2 | 47496 | 1320 | THREW:ReferenceError: Intl is not defined |
| `arktype` | ^2.0.0 | validation-edge | runtime_error | 2 | 3 | 175062 | 1936 | THREW:TypeError: _arktype.type.call is not a function |
| `computed-types` | ^1.11.0 | validation-edge | runtime_error | 2 | 2 | 19267 | 1305 | THREW:ValidationError: name: Expect value to equal "undefined" |
| `content-disposition` | ^0.5.4 | worker-utils-misc | runtime_error | 2 | 4 | 15429 | 220 | THREW:TypeError: u.prototype is not an object or null |
| `etag` | ^1.8.1 | worker-utils-misc | runtime_error | 2 | 5 | 11453 | 1002 | THREW:TypeError: d.createHash is not a function |
| `gpt-3-encoder` | ^1.1.4 | ai-clients-tokenizers | compile_error | 2 | 4 | 8894 | 368 | invalid property name in regular expression |
| `cli-truncate` | ^4.0.0 | ansi-string | compile_error | 2 | 2 | 26797 | 279 | invalid property name in regular expression |
| `string-width` | ^7.2.0 | ansi-string | compile_error | 2 | 2 | 22016 | 218 | invalid property name in regular expression |
| `wrap-ansi` | ^9.0.0 | ansi-string | compile_error | 2 | 2 | 26285 | 284 | invalid property name in regular expression |
| `meow` | ^13.2.0 | cli-args | compile_error | 2 | 8 | 170252 | 2753 | invalid class property name in regular expression |
| `humanize-string` | ^3.0.0 | color-format | compile_error | 2 | 2 | 3972 | 322 | invalid class property name in regular expression |
| `parse-duration` | ^1.1.0 | datetime | compile_error | 2 | 2 | 3784 | 882 | invalid class property name in regular expression |
| `path-to-regexp` | ^8.2.0 | edge-routers | compile_error | 2 | 2 | 9489 | 220 | invalid class property name in regular expression |
| `marked` | ^11.0.0 | markdown | compile_error | 2 | 2 | 38893 | 389 | invalid class property name in regular expression |
| `micromark` | ^4.0.0 | markdown-html | compile_error | 2 | 2 | 56014 | 899 | invalid property name in regular expression |
| `remark-html` | ^16.0.1 | markdown-html | compile_error | 4 | 4 | 150805 | 4765 | invalid property name in regular expression |
| `mdast-util-from-markdown` | ^2.0.2 | markdown-unified | compile_error | 50 | 50 | 122707 | 18002 | invalid property name in regular expression |
| `mdast-util-to-markdown` | ^2.1.2 | markdown-unified | compile_error | 2 | 2 | 25583 | 1091 | invalid property name in regular expression |
| `rehype-raw` | ^7.0.0 | markdown-unified | compile_error | 10 | 10 | 344853 | 4281 | invalid property name in regular expression |
| `rehype-stringify` | ^10.0.1 | markdown-unified | compile_error | 8 | 8 | 127197 | 2993 | invalid property name in regular expression |
| `remark-gfm` | ^4.0.0 | markdown-unified | compile_error | 10 | 10 | 171013 | 5375 | invalid property name in regular expression |
| `remark-parse` | ^11.0.0 | markdown-unified | compile_error | 4 | 4 | 74510 | 1447 | invalid property name in regular expression |
| `remark-rehype` | ^11.1.1 | markdown-unified | compile_error | 6 | 6 | 93096 | 2252 | invalid property name in regular expression |
| `remark-stringify` | ^11.0.0 | markdown-unified | compile_error | 6 | 6 | 98982 | 2566 | invalid property name in regular expression |
| `camelcase` | ^8.0.0 | string | compile_error | 2 | 2 | 4251 | 527 | invalid class property name in regular expression |
| `change-case` | ^5.4.4 | string | compile_error | 2 | 2 | 6761 | 218 | invalid class property name in regular expression |
| `decamelize` | ^6.0.0 | string | compile_error | 2 | 2 | 3648 | 296 | invalid class property name in regular expression |
| `param-case` | ^4.0.0 | string | compile_error | 2 | 2 | 3619 | 178 | invalid class property name in regular expression |
| `snake-case` | ^4.0.0 | string | compile_error | 2 | 2 | 3619 | 198 | invalid class property name in regular expression |
| `title-case` | ^4.3.1 | string | compile_error | 2 | 2 | 4118 | 309 | invalid class property name in regular expression |
| `liquidjs` | ^10.16.1 | templating | compile_error | 2 | 9 | 94897 | 3801 | invalid class property name in regular expression |
| `@js-temporal/polyfill` | ^0.4.4 | temporal-datetime | compile_error | 2 | 2 | 204420 | 2815 | invalid class property name in regular expression |
| `valibot` | ^0.42.0 | validation | compile_error | 2 | 2 | 73493 | 830 | invalid property name in regular expression |
| `zod-validation-error` | ^3.4.0 | validation-edge | compile_error | 9 | 9 | 79404 | 2235 | invalid class property name in regular expression |
| `@mistralai/mistralai` | ^1.1.0 | ai-clients-tokenizers | bundle_error |  |  |  |  | module too large to transpile (1166 KB: mistralai.bundle.mjs); this library has a single oversized module — try a smaller alternative |
| `cohere-ai` | ^7.14.0 | ai-clients-tokenizers | bundle_error |  |  |  |  | module too large to transpile (1088 KB: cohere-ai.bundle.mjs); this library has a single oversized module — try a smaller alternative |
| `gpt-tokenizer` | ^2.5.0 | ai-clients-tokenizers | bundle_error |  |  |  |  | module too large to transpile (981 KB: gpt-tokenizer.bundle.mjs); this library has a single oversized module — try a smaller alternative |
| `js-tiktoken` | ^1.0.15 | ai-clients-tokenizers | bundle_error |  |  |  |  | module too large to transpile (5468 KB: js-tiktoken.bundle.mjs); this library has a single oversized module — try a smaller alternative |
| `html-minifier-terser` | ^7.2.0 | email-html-render | bundle_error |  |  |  |  | module too large to transpile (779 KB: html-minifier-terser.bundle.mjs); this library has a single oversized module — try a smaller alternative |
| `htmlnano` | ^2.1.1 | email-html-render | bundle_error |  |  |  |  | fetch https://esm.sh/typescript?target=es2020 -> 500 |
| `jsx-email` | ^2.0.0 | email-html-render | bundle_error |  |  |  |  | module too large to transpile (9851 KB: jsx-email.bundle.mjs); this library has a single oversized module — try a smaller alternative |
| `mjml-core` | ^4.15.3 | email-html-render | bundle_error |  |  |  |  | fetch https://esm.sh/entities/lib/decode?target=es2020 -> 404 |
| `image-size` | ^1.2.0 | image-binary | bundle_error |  |  |  |  | Unexpected token (2:52) |
| `thumbhash` | ^0.1.1 | image-binary | bundle_error |  |  |  |  | Unexpected token (2:33) |
| `marked-terminal` | ^7.1.0 | markdown-html | bundle_error |  |  |  |  | module too large to transpile (1453 KB: marked-terminal.bundle.mjs); this library has a single oversized module — try a smaller alternative |
| `mathjs` | ^12.4.0 | numbers | bundle_error |  |  |  |  | module too large to transpile (704 KB: mathjs.bundle.mjs); this library has a single oversized module — try a smaller alternative |
| `effect` | ^3.11.0 | result-fp | bundle_error |  |  |  |  | module too large to transpile (950 KB: effect.bundle.mjs); this library has a single oversized module — try a smaller alternative |
| `mysql2` | ^3.11.5 | serverless-db | bundle_error |  |  |  |  | module too large to transpile (987 KB: promise.bundle.mjs); this library has a single oversized module — try a smaller alternative |
| `pug` | ^3.0.3 | templating | bundle_error |  |  |  |  | module too large to transpile (814 KB: pug.bundle.mjs); this library has a single oversized module — try a smaller alternative |
| `tinytime` | ^0.2.6 | temporal-datetime | bundle_error |  |  |  |  | fetch https://esm.sh/tinytime@%5E0.2.6?bundle&target=es2020 -> 500 |
