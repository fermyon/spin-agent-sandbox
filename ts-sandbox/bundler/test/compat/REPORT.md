# Bundler → Sandbox compatibility sweep

**253/293 libraries pass end-to-end** (bundle + run + expected output).

| outcome | count |
|---|---|
| `pass` | 253 |
| `runtime_error` | 20 |
| `compile_error` | 17 |
| `bundle_error` | 3 |

## Results

| library | version | category | outcome | fetches | modules | bytes | ms | detail |
|---|---|---|---|--:|--:|--:|--:|---|
| `ansi-regex` | ^6.1.0 | ansi-string | ✅ pass | 2 | 2 | 3141 | 156 |  |
| `ansi-styles` | ^6.2.1 | ansi-string | ✅ pass | 2 | 2 | 5644 | 272 |  |
| `common-tags` | ^1.8.2 | ansi-string | ✅ pass | 2 | 2 | 21642 | 444 |  |
| `dedent` | ^1.5.3 | ansi-string | ✅ pass | 2 | 2 | 5354 | 278 |  |
| `emoji-regex` | ^10.4.0 | ansi-string | ✅ pass | 2 | 2 | 17095 | 164 |  |
| `slice-ansi` | ^7.1.0 | ansi-string | ✅ pass | 2 | 2 | 8838 | 318 |  |
| `sprintf-js` | ^1.1.3 | ansi-string | ✅ pass | 2 | 2 | 7086 | 506 |  |
| `strip-ansi` | ^7.1.0 | ansi-string | ✅ pass | 2 | 2 | 3304 | 159 |  |
| `async` | ^3.2.5 | async-flow | ✅ pass | 2 | 3 | 27288 | 1904 |  |
| `async-retry` | ^1.3.3 | async-flow | ✅ pass | 2 | 2 | 7801 | 323 |  |
| `await-to-js` | ^3.0.0 | async-flow | ✅ pass | 2 | 2 | 3224 | 2294 |  |
| `bluebird` | ^3.7.2 | async-flow | ✅ pass | 2 | 3 | 88415 | 1615 |  |
| `p-all` | ^5.0.0 | async-flow | ✅ pass | 2 | 2 | 4635 | 265 |  |
| `p-defer` | ^4.0.1 | async-flow | ✅ pass | 2 | 2 | 3073 | 318 |  |
| `p-props` | ^6.0.0 | async-flow | ✅ pass | 2 | 2 | 5071 | 263 |  |
| `p-reduce` | ^3.0.0 | async-flow | ✅ pass | 2 | 2 | 3225 | 201 |  |
| `p-some` | ^6.0.0 | async-flow | ✅ pass | 2 | 3 | 8401 | 239 |  |
| `p-timeout` | ^6.1.2 | async-flow | ✅ pass | 2 | 2 | 4401 | 181 |  |
| `promise-retry` | ^2.0.1 | async-flow | ✅ pass | 2 | 2 | 8388 | 1712 |  |
| `rxjs` | ^7.8.0 | async-flow | ✅ pass | 4 | 4 | 103627 | 3141 |  |
| `lodash` |  | built-in | ✅ pass | 0 | 0 | 1325 | 1 |  |
| `nanoid` |  | built-in | ✅ pass | 0 | 0 | 1305 | 1 |  |
| `uuid` |  | built-in | ✅ pass | 0 | 0 | 1295 | 1 |  |
| `arg` | ^5.0.2 | cli-args | ✅ pass | 2 | 3 | 7215 | 191 |  |
| `cac` | ^6.7.14 | cli-args | ✅ pass | 2 | 4 | 15453 | 371 |  |
| `command-line-args` | ^6.0.1 | cli-args | ✅ pass | 2 | 3 | 20650 | 2674 |  |
| `commander` | ^12.1.0 | cli-args | ✅ pass | 2 | 8 | 50480 | 597 |  |
| `dashdash` | ^2.0.0 | cli-args | ✅ pass | 2 | 9 | 31687 | 2741 |  |
| `minimist` | ^1.2.8 | cli-args | ✅ pass | 2 | 2 | 6941 | 221 |  |
| `mri` | ^1.2.0 | cli-args | ✅ pass | 2 | 2 | 4480 | 194 |  |
| `optionator` | ^0.9.4 | cli-args | ✅ pass | 2 | 3 | 44714 | 2899 |  |
| `sade` | ^1.8.1 | cli-args | ✅ pass | 2 | 3 | 10137 | 233 |  |
| `yargs` | ^17.7.2 | cli-args | ✅ pass | 2 | 8 | 95951 | 1154 |  |
| `yargs-parser` | ^21.1.1 | cli-args | ✅ pass | 2 | 6 | 24553 | 397 |  |
| `clone` | ^2.1.2 | clone-lru | ✅ pass | 2 | 3 | 10740 | 296 |  |
| `clone-deep` | ^4.0.1 | clone-lru | ✅ pass | 2 | 3 | 13238 | 238 |  |
| `copy-anything` | ^3.0.5 | clone-lru | ✅ pass | 2 | 2 | 3542 | 178 |  |
| `deepmerge-ts` | ^7.1.0 | clone-lru | ✅ pass | 2 | 2 | 9569 | 234 |  |
| `defu` | ^6.1.4 | clone-lru | ✅ pass | 2 | 2 | 3628 | 181 |  |
| `fast-copy` | ^3.0.2 | clone-lru | ✅ pass | 2 | 2 | 7082 | 256 |  |
| `klona` | ^2.0.6 | clone-lru | ✅ pass | 2 | 2 | 3392 | 612 |  |
| `lru-cache` | ^11.0.0 | clone-lru | ✅ pass | 2 | 3 | 28944 | 2001 |  |
| `quick-lru` | ^7.0.0 | clone-lru | ✅ pass | 2 | 2 | 7681 | 1964 |  |
| `rfdc` | ^1.4.0 | clone-lru | ✅ pass | 2 | 3 | 11213 | 1504 |  |
| `ts-deepmerge` | ^7.0.0 | clone-lru | ✅ pass | 2 | 2 | 3587 | 299 |  |
| `denque` | ^2.1.0 | collections-async | ✅ pass | 2 | 2 | 9271 | 231 |  |
| `eventemitter3` | ^5.0.0 | collections-async | ✅ pass | 2 | 2 | 6436 | 204 |  |
| `immutable` | ^4.3.0 | collections-async | ✅ pass | 2 | 2 | 69319 | 1119 |  |
| `mitt` | ^3.0.0 | collections-async | ✅ pass | 2 | 2 | 3159 | 233 |  |
| `mnemonist` | ^0.39.0 | collections-async | ✅ pass | 2 | 2 | 6534 | 165 |  |
| `nanoevents` | ^9.0.0 | collections-async | ✅ pass | 2 | 2 | 3417 | 171 |  |
| `p-limit` | ^5.0.0 | collections-async | ✅ pass | 2 | 2 | 4859 | 196 |  |
| `p-map` | ^7.0.0 | collections-async | ✅ pass | 2 | 2 | 6273 | 220 |  |
| `p-queue` | ^8.0.0 | collections-async | ✅ pass | 2 | 2 | 14180 | 312 |  |
| `p-retry` | ^6.0.0 | collections-async | ✅ pass | 2 | 2 | 9708 | 242 |  |
| `tiny-queue` | ^0.2.1 | collections-async | ✅ pass | 2 | 2 | 4126 | 330 |  |
| `yocto-queue` | ^1.1.0 | collections-async | ✅ pass | 2 | 2 | 4194 | 175 |  |
| `bytes` | ^3.1.2 | color-format | ✅ pass | 2 | 2 | 4759 | 239 |  |
| `chroma-js` | ^2.4.2 | color-format | ✅ pass | 2 | 2 | 37974 | 757 |  |
| `color` | ^4.2.3 | color-format | ✅ pass | 2 | 2 | 26454 | 511 |  |
| `color-convert` | ^2.0.1 | color-format | ✅ pass | 2 | 2 | 16974 | 451 |  |
| `color-name` | ^2.0.0 | color-format | ✅ pass | 2 | 2 | 6349 | 184 |  |
| `color-string` | ^1.9.1 | color-format | ✅ pass | 2 | 2 | 10903 | 261 |  |
| `colord` | ^2.9.3 | color-format | ✅ pass | 2 | 2 | 8408 | 328 |  |
| `filesize` | ^10.1.6 | color-format | ✅ pass | 2 | 2 | 5112 | 259 |  |
| `pretty-bytes` | ^6.1.1 | color-format | ✅ pass | 2 | 2 | 4029 | 199 |  |
| `tinycolor2` | ^1.6.0 | color-format | ✅ pass | 2 | 2 | 18144 | 341 |  |
| `compare-versions` | ^6.1.0 | config-semver | ✅ pass | 2 | 2 | 4914 | 214 |  |
| `dotenv` | ^16.4.0 | config-semver | ✅ pass | 2 | 7 | 20774 | 230 |  |
| `dotenv-expand` | ^11.0.0 | config-semver | ✅ pass | 4 | 9 | 23484 | 711 |  |
| `dotenv-parse-variables` | ^2.0.0 | config-semver | ✅ pass | 2 | 3 | 13768 | 341 |  |
| `env-var` | ^7.5.0 | config-semver | ✅ pass | 2 | 4 | 16192 | 521 |  |
| `rc` | ^1.2.8 | config-semver | ✅ pass | 2 | 2 | 3547 | 514 |  |
| `semver` | ^7.6.0 | config-semver | ✅ pass | 2 | 3 | 32812 | 522 |  |
| `semver-compare` | ^1.0.0 | config-semver | ✅ pass | 2 | 2 | 3944 | 210 |  |
| `semver-diff` | ^4.0.0 | config-semver | ✅ pass | 2 | 3 | 31340 | 714 |  |
| `aes-js` | ^3.1.2 | crypto-jwt | ✅ pass | 2 | 2 | 48072 | 962 |  |
| `bcryptjs` | ^2.4.3 | crypto-jwt | ✅ pass | 2 | 4 | 28349 | 2006 |  |
| `elliptic` | ^6.5.4 | crypto-jwt | ✅ pass | 2 | 4 | 145719 | 1868 |  |
| `hash.js` | ^1.1.7 | crypto-jwt | ✅ pass | 2 | 2 | 20739 | 502 |  |
| `jose` | ^5.9.0 | crypto-jwt | ✅ pass | 2 | 2 | 72092 | 2546 |  |
| `js-sha512` | ^0.9.0 | crypto-jwt | ✅ pass | 2 | 3 | 22905 | 615 |  |
| `jsrsasign` | ^11.1.0 | crypto-jwt | ✅ pass | 2 | 3 | 318750 | 6620 |  |
| `jssha` | ^3.3.1 | crypto-jwt | ✅ pass | 2 | 2 | 24452 | 627 |  |
| `node-forge` | ^1.3.1 | crypto-jwt | ✅ pass | 2 | 2 | 291014 | 3412 |  |
| `scrypt-js` | ^3.0.1 | crypto-jwt | ✅ pass | 2 | 2 | 9858 | 725 |  |
| `dateformat` | ^5.0.3 | datetime | ✅ pass | 2 | 2 | 7628 | 234 |  |
| `fecha` | ^4.2.3 | datetime | ✅ pass | 2 | 2 | 8809 | 222 |  |
| `humanize-duration` | ^3.31.0 | datetime | ✅ pass | 2 | 2 | 30354 | 396 |  |
| `moment` | ^2.30.0 | datetime | ✅ pass | 2 | 2 | 64164 | 912 |  |
| `pretty-ms` | ^9.0.0 | datetime | ✅ pass | 2 | 2 | 5521 | 1635 |  |
| `spacetime` | ^7.6.0 | datetime | ✅ pass | 2 | 2 | 53062 | 930 |  |
| `timeago.js` | ^4.0.0 | datetime | ✅ pass | 2 | 2 | 4391 | 1639 |  |
| `tinyduration` | ^3.3.0 | datetime | ✅ pass | 2 | 2 | 5355 | 989 |  |
| `@vue/reactivity` | ^3.5.0 | frameworks-render | ✅ pass | 2 | 2 | 23941 | 1096 |  |
| `@vue/shared` | ^3.5.0 | frameworks-render | ✅ pass | 2 | 2 | 19095 | 2101 |  |
| `htm` | ^3.1.1 | frameworks-render | ✅ pass | 2 | 2 | 4043 | 229 |  |
| `hyperapp` | ^2.0.22 | frameworks-render | ✅ pass | 2 | 2 | 6262 | 2002 |  |
| `hyperscript-helpers` | ^3.0.3 | frameworks-render | ✅ pass | 2 | 2 | 5632 | 2568 |  |
| `mithril` | ^2.2.2 | frameworks-render | ✅ pass | 2 | 2 | 6971 | 367 |  |
| `nunjucks` | ^3.2.4 | frameworks-render | ✅ pass | 2 | 3 | 101064 | 1810 |  |
| `preact` | ^10.24.0 | frameworks-render | ✅ pass | 2 | 2 | 14540 | 2809 |  |
| `preact-render-to-string` | ^6.5.0 | frameworks-render | ✅ pass | 6 | 6 | 40036 | 5547 |  |
| `react` | ^18.3.1 | frameworks-render | ✅ pass | 2 | 2 | 11930 | 585 |  |
| `vhtml` | ^2.2.0 | frameworks-render | ✅ pass | 2 | 2 | 3569 | 2104 |  |
| `fp-ts` | ^2.16.0 | functional | ✅ pass | 4 | 4 | 20788 | 2172 |  |
| `immer` | ^10.0.0 | functional | ✅ pass | 2 | 2 | 17530 | 536 |  |
| `just-clone` | ^6.2.0 | functional | ✅ pass | 2 | 2 | 3523 | 331 |  |
| `just-group-by` | ^1.2.0 | functional | ✅ pass | 2 | 2 | 3303 | 470 |  |
| `just-omit` | ^2.2.0 | functional | ✅ pass | 2 | 2 | 3100 | 261 |  |
| `just-pick` | ^4.2.0 | functional | ✅ pass | 2 | 2 | 3080 | 260 |  |
| `moderndash` | ^4.0.0 | functional | ✅ pass | 2 | 2 | 16214 | 382 |  |
| `mout` | ^1.2.4 | functional | ✅ pass | 2 | 2 | 15188 | 376 |  |
| `radash` | ^12.0.0 | functional | ✅ pass | 2 | 2 | 19171 | 342 |  |
| `rambda` | ^9.0.0 | functional | ✅ pass | 2 | 2 | 38505 | 706 |  |
| `rambdax` | ^11.0.0 | functional | ✅ pass | 2 | 2 | 53966 | 1076 |  |
| `ramda` | ^0.29.1 | functional | ✅ pass | 2 | 2 | 66003 | 1077 |  |
| `remeda` | ^2.0.0 | functional | ✅ pass | 2 | 2 | 33250 | 550 |  |
| `bs58` | ^6.0.0 | hash-crypto | ✅ pass | 2 | 2 | 4487 | 1002 |  |
| `crc-32` | ^1.2.2 | hash-crypto | ✅ pass | 2 | 2 | 5537 | 210 |  |
| `crypto-js` | ^4.2.0 | hash-crypto | ✅ pass | 2 | 2 | 75955 | 1052 |  |
| `hash-sum` | ^2.0.0 | hash-crypto | ✅ pass | 2 | 2 | 4524 | 1098 |  |
| `js-sha3` | ^0.9.3 | hash-crypto | ✅ pass | 2 | 3 | 14869 | 584 |  |
| `murmurhash` | ^2.0.1 | hash-crypto | ✅ pass | 2 | 2 | 5226 | 183 |  |
| `object-hash` | ^3.0.0 | hash-crypto | ✅ pass | 2 | 2 | 38359 | 1757 |  |
| `tweetnacl` | ^1.0.3 | hash-crypto | ✅ pass | 2 | 2 | 36702 | 1580 |  |
| `cross-fetch` | ^4.0.0 | http-url | ✅ pass | 2 | 2 | 14349 | 758 |  |
| `is-url` | ^1.2.4 | http-url | ✅ pass | 2 | 2 | 3845 | 249 |  |
| `ky` | ^1.7.2 | http-url | ✅ pass | 2 | 2 | 21085 | 2116 |  |
| `normalize-url` | ^8.0.1 | http-url | ✅ pass | 2 | 2 | 7716 | 190 |  |
| `parse-url` | ^9.2.0 | http-url | ✅ pass | 2 | 2 | 9228 | 2658 |  |
| `psl` | ^1.9.0 | http-url | ✅ pass | 2 | 2 | 163718 | 787 |  |
| `query-string` | ^9.1.0 | http-url | ✅ pass | 2 | 2 | 11763 | 286 |  |
| `querystringify` | ^2.2.0 | http-url | ✅ pass | 2 | 2 | 4489 | 2599 |  |
| `tldts` | ^6.1.0 | http-url | ✅ pass | 2 | 2 | 111047 | 2142 |  |
| `url-parse` | ^1.5.10 | http-url | ✅ pass | 2 | 2 | 9809 | 308 |  |
| `arr-diff` | ^4.0.0 | is-checks-glob | ✅ pass | 2 | 2 | 4120 | 200 |  |
| `array-union` | ^3.0.1 | is-checks-glob | ✅ pass | 2 | 2 | 2985 | 154 |  |
| `braces` | ^3.0.3 | is-checks-glob | ✅ pass | 2 | 3 | 20250 | 1341 |  |
| `is-arrayish` | ^0.3.2 | is-checks-glob | ✅ pass | 2 | 2 | 3912 | 212 |  |
| `is-buffer` | ^2.0.5 | is-checks-glob | ✅ pass | 2 | 2 | 3939 | 203 |  |
| `is-number` | ^7.0.0 | is-checks-glob | ✅ pass | 2 | 2 | 3999 | 673 |  |
| `is-plain-object` | ^5.0.0 | is-checks-glob | ✅ pass | 2 | 2 | 3115 | 1384 |  |
| `kind-of` | ^6.0.3 | is-checks-glob | ✅ pass | 2 | 2 | 5917 | 178 |  |
| `micromatch` | ^4.0.8 | is-checks-glob | ✅ pass | 2 | 5 | 47640 | 1186 |  |
| `minimatch` | ^9.0.5 | is-checks-glob | ✅ pass | 2 | 3 | 31670 | 691 |  |
| `picomatch` | ^4.0.2 | is-checks-glob | ✅ pass | 2 | 3 | 28641 | 515 |  |
| `type-detect` | ^4.0.8 | is-checks-glob | ✅ pass | 2 | 2 | 6183 | 241 |  |
| `deep-equal` | ^2.2.0 | json-data | ✅ pass | 2 | 3 | 56903 | 912 |  |
| `devalue` | ^5.1.0 | json-data | ✅ pass | 2 | 4 | 24549 | 347 |  |
| `dot-prop` | ^9.0.0 | json-data | ✅ pass | 2 | 2 | 5452 | 266 |  |
| `fast-json-stable-stringify` | ^2.1.0 | json-data | ✅ pass | 2 | 2 | 4819 | 243 |  |
| `flat` | ^6.0.0 | json-data | ✅ pass | 2 | 2 | 4101 | 218 |  |
| `flatted` | ^3.3.0 | json-data | ✅ pass | 2 | 2 | 3698 | 240 |  |
| `json-stable-stringify` | ^1.1.0 | json-data | ✅ pass | 2 | 2 | 27135 | 1007 |  |
| `jsonpath-plus` | ^10.0.0 | json-data | ✅ pass | 2 | 2 | 28103 | 456 |  |
| `object-path` | ^0.11.8 | json-data | ✅ pass | 2 | 2 | 6856 | 836 |  |
| `safe-stable-stringify` | ^2.5.0 | json-data | ✅ pass | 2 | 2 | 11400 | 1017 |  |
| `sort-keys` | ^5.0.0 | json-data | ✅ pass | 2 | 2 | 3672 | 214 |  |
| `superjson` | ^2.2.0 | json-data | ✅ pass | 2 | 2 | 15233 | 371 |  |
| `lodash.clonedeep` | ^4.5.0 | lodash-split | ✅ pass | 2 | 2 | 13323 | 264 |  |
| `lodash.debounce` | ^4.0.8 | lodash-split | ✅ pass | 2 | 2 | 5502 | 319 |  |
| `lodash.defaults` | ^4.2.0 | lodash-split | ✅ pass | 2 | 2 | 6261 | 255 |  |
| `lodash.get` | ^4.4.2 | lodash-split | ✅ pass | 2 | 2 | 8756 | 799 |  |
| `lodash.groupby` | ^4.6.0 | lodash-split | ✅ pass | 2 | 2 | 16595 | 345 |  |
| `lodash.isequal` | ^4.5.0 | lodash-split | ✅ pass | 2 | 2 | 14467 | 480 |  |
| `lodash.merge` | ^4.6.2 | lodash-split | ✅ pass | 2 | 2 | 14339 | 407 |  |
| `lodash.omit` | ^4.5.0 | lodash-split | ✅ pass | 2 | 2 | 18713 | 356 |  |
| `lodash.pick` | ^4.4.0 | lodash-split | ✅ pass | 2 | 2 | 5693 | 429 |  |
| `lodash.set` | ^4.3.2 | lodash-split | ✅ pass | 2 | 2 | 9106 | 395 |  |
| `lodash.throttle` | ^4.1.1 | lodash-split | ✅ pass | 2 | 2 | 5700 | 315 |  |
| `lodash.uniq` | ^4.5.0 | lodash-split | ✅ pass | 2 | 2 | 8561 | 421 |  |
| `ansi-colors` | ^4.1.3 | logging-color | ✅ pass | 2 | 3 | 10112 | 385 |  |
| `chalk` | ^5.3.0 | logging-color | ✅ pass | 2 | 2 | 8422 | 297 |  |
| `cli-color` | ^2.0.4 | logging-color | ✅ pass | 2 | 3 | 57660 | 1746 |  |
| `colorette` | ^2.0.20 | logging-color | ✅ pass | 2 | 4 | 7377 | 219 |  |
| `debug` | ^4.3.7 | logging-color | ✅ pass | 2 | 3 | 11159 | 368 |  |
| `kleur` | ^4.1.5 | logging-color | ✅ pass | 2 | 3 | 5909 | 201 |  |
| `loglevel` | ^1.9.2 | logging-color | ✅ pass | 2 | 2 | 6926 | 330 |  |
| `picocolors` | ^1.1.1 | logging-color | ✅ pass | 2 | 2 | 5714 | 242 |  |
| `entities` | ^4.5.0 | markdown-html | ✅ pass | 2 | 2 | 81683 | 1346 |  |
| `gray-matter` | ^4.0.3 | markdown-html | ✅ pass | 2 | 3 | 60126 | 858 |  |
| `html-entities` | ^2.5.2 | markdown-html | ✅ pass | 2 | 2 | 39147 | 906 |  |
| `html-to-text` | ^9.0.5 | markdown-html | ✅ pass | 2 | 2 | 154749 | 2611 |  |
| `linkify-it` | ^5.0.0 | markdown-html | ✅ pass | 2 | 2 | 14466 | 528 |  |
| `remove-markdown` | ^0.5.0 | markdown-html | ✅ pass | 2 | 2 | 5579 | 2364 |  |
| `sanitize-html` | ^2.13.0 | markdown-html | ✅ pass | 2 | 7 | 206226 | 3666 |  |
| `striptags` | ^3.2.0 | markdown-html | ✅ pass | 2 | 2 | 5195 | 719 |  |
| `axios` | ^1.7.0 | node-shimmed | ✅ pass | 2 | 4 | 55327 | 798 |  |
| `content-type` | ^1.0.5 | node-shimmed | ✅ pass | 2 | 2 | 5835 | 180 |  |
| `cookie` | ^0.6.0 | node-shimmed | ✅ pass | 2 | 2 | 6159 | 200 |  |
| `form-data` | ^4.0.0 | node-shimmed | ✅ pass | 2 | 12 | 183183 | 1304 |  |
| `media-typer` | ^1.1.0 | node-shimmed | ✅ pass | 2 | 2 | 5077 | 1532 |  |
| `mime` | ^3.0.0 | node-shimmed | ✅ pass | 2 | 2 | 40142 | 353 |  |
| `mime-types` | ^2.1.35 | node-shimmed | ✅ pass | 2 | 3 | 144918 | 961 |  |
| `path-browserify` | ^1.0.1 | node-shimmed | ✅ pass | 2 | 3 | 9568 | 564 |  |
| `punycode` | ^2.3.1 | node-shimmed | ✅ pass | 2 | 2 | 5382 | 476 |  |
| `set-cookie-parser` | ^2.6.0 | node-shimmed | ✅ pass | 2 | 2 | 6331 | 371 |  |
| `statuses` | ^2.0.1 | node-shimmed | ✅ pass | 2 | 2 | 6180 | 894 |  |
| `big.js` | ^6.2.1 | number | ✅ pass | 2 | 2 | 9643 | 1438 |  |
| `accounting` | ^0.4.1 | numbers | ✅ pass | 2 | 2 | 7168 | 297 |  |
| `bignumber.js` | ^9.1.0 | numbers | ✅ pass | 2 | 2 | 22470 | 597 |  |
| `currency.js` | ^2.0.4 | numbers | ✅ pass | 2 | 2 | 5920 | 382 |  |
| `d3-format` | ^3.1.0 | numbers | ✅ pass | 2 | 2 | 7628 | 209 |  |
| `decimal.js` | ^10.4.0 | numbers | ✅ pass | 2 | 2 | 35208 | 668 |  |
| `expr-eval` | ^2.0.2 | numbers | ✅ pass | 2 | 2 | 28703 | 556 |  |
| `fraction.js` | ^4.3.0 | numbers | ✅ pass | 2 | 2 | 8721 | 287 |  |
| `js-big-decimal` | ^2.0.7 | numbers | ✅ pass | 2 | 2 | 12389 | 720 |  |
| `numbro` | ^2.5.0 | numbers | ✅ pass | 2 | 2 | 43724 | 962 |  |
| `numeral` | ^2.0.6 | numbers | ✅ pass | 2 | 2 | 15107 | 332 |  |
| `deepmerge` | ^4.3.1 | object | ✅ pass | 2 | 2 | 5218 | 769 |  |
| `fast-deep-equal` | ^3.1.3 | object | ✅ pass | 2 | 2 | 4425 | 214 |  |
| `@iarna/toml` | ^2.2.5 | parsing | ✅ pass | 2 | 4 | 49297 | 547 |  |
| `csv-parse` | ^5.5.0 | parsing | ✅ pass | 2 | 3 | 35458 | 577 |  |
| `fast-xml-parser` | ^4.3.0 | parsing | ✅ pass | 2 | 2 | 39255 | 979 |  |
| `front-matter` | ^4.0.2 | parsing | ✅ pass | 2 | 3 | 47255 | 1765 |  |
| `ini` | ^4.1.0 | parsing | ✅ pass | 2 | 3 | 8405 | 248 |  |
| `json5` | ^2.2.3 | parsing | ✅ pass | 2 | 2 | 35373 | 1571 |  |
| `markdown-it` | ^14.0.0 | parsing | ✅ pass | 2 | 2 | 151278 | 1373 |  |
| `papaparse` | ^5.4.0 | parsing | ✅ pass | 2 | 2 | 23220 | 492 |  |
| `smol-toml` | ^1.1.4 | parsing | ✅ pass | 2 | 2 | 17210 | 1662 |  |
| `toml` | ^3.0.0 | parsing | ✅ pass | 2 | 2 | 31509 | 652 |  |
| `yaml` | ^2.3.0 | parsing | ✅ pass | 27 | 27 | 147483 | 4052 |  |
| `qs` | ^6.11.0 | querystring | ✅ pass | 2 | 2 | 46231 | 800 |  |
| `escape-string-regexp` | ^5.0.0 | string | ✅ pass | 2 | 2 | 3240 | 395 |  |
| `he` | ^1.2.0 | string | ✅ pass | 2 | 2 | 90721 | 1540 |  |
| `indent-string` | ^5.0.0 | string | ✅ pass | 2 | 2 | 3518 | 724 |  |
| `no-case` | ^3.0.4 | string | ✅ pass | 2 | 2 | 2974 | 177 |  |
| `pluralize` | ^8.0.0 | string | ✅ pass | 2 | 2 | 9660 | 911 |  |
| `string-hash` | ^1.1.3 | string | ✅ pass | 2 | 2 | 3729 | 177 |  |
| `voca` | ^1.4.1 | string | ✅ pass | 2 | 2 | 26250 | 418 |  |
| `word-wrap` | ^1.2.5 | string | ✅ pass | 2 | 2 | 4484 | 491 |  |
| `dot` | ^1.1.3 | templating | ✅ pass | 2 | 2 | 7113 | 300 |  |
| `ejs` | ^3.1.10 | templating | ✅ pass | 2 | 4 | 19498 | 4527 |  |
| `eta` | ^3.4.0 | templating | ✅ pass | 2 | 2 | 12491 | 322 |  |
| `handlebars` | ^4.7.8 | templating | ✅ pass | 2 | 2 | 108877 | 1405 |  |
| `lodash.template` | ^4.5.0 | templating | ✅ pass | 2 | 2 | 14145 | 331 |  |
| `micromustache` | ^8.0.3 | templating | ✅ pass | 2 | 2 | 8216 | 307 |  |
| `mustache` | ^4.2.0 | templating | ✅ pass | 2 | 2 | 9472 | 1165 |  |
| `squirrelly` | ^9.1.0 | templating | ✅ pass | 2 | 2 | 13850 | 1616 |  |
| `underscore` | ^1.13.6 | templating | ✅ pass | 2 | 2 | 26503 | 480 |  |
| `ms` | ^2.1.3 | time | ✅ pass | 2 | 2 | 4767 | 1401 |  |
| `classnames` | ^2.5.1 | ui | ✅ pass | 2 | 2 | 4539 | 820 |  |
| `@sinclair/typebox` | ^0.33.0 | validation | ✅ pass | 4 | 4 | 128629 | 5584 |  |
| `ajv` | ^8.17.0 | validation | ✅ pass | 2 | 2 | 122051 | 4579 |  |
| `class-validator` | ^0.14.1 | validation | ✅ pass | 2 | 2 | 394112 | 4959 |  |
| `email-validator` | ^2.0.4 | validation | ✅ pass | 2 | 2 | 4016 | 942 |  |
| `fastest-validator` | ^1.19.0 | validation | ✅ pass | 2 | 2 | 49611 | 2479 |  |
| `joi` | ^17.13.0 | validation | ✅ pass | 2 | 2 | 151242 | 1953 |  |
| `superstruct` | ^2.0.2 | validation | ✅ pass | 2 | 2 | 13840 | 1760 |  |
| `validate.js` | ^0.13.1 | validation | ✅ pass | 2 | 2 | 18266 | 4553 |  |
| `validator` | ^13.11.0 | validation | ✅ pass | 2 | 2 | 135827 | 1485 |  |
| `yup` | ^1.4.0 | validation | ✅ pass | 2 | 2 | 48789 | 653 |  |
| `string-length` | ^6.0.0 | ansi-string | runtime_error | 2 | 2 | 3525 | 171 | THREW:ReferenceError: Intl is not defined |
| `merge-deep` | ^3.0.3 | clone-lru | runtime_error | 2 | 3 | 9562 | 310 | THREW:Error: module not found: 'kind-of'. The sandbox only bundles a fixed set of modules: cheerio, node-html-parser, zod, js-yaml, nanoid, ulidx, uuid, lodash, date-fns, dayjs, @spinframework/spin-kv |
| `jsonwebtoken` | ^9.0.2 | crypto-jwt | runtime_error | 2 | 7 | 70456 | 2245 | THREW:TypeError: N.prototype is not an object or null |
| `jws` | ^4.0.0 | crypto-jwt | runtime_error | 2 | 7 | 25114 | 2433 | THREW:TypeError: S.prototype is not an object or null |
| `date-fns-tz` | ^3.2.0 | datetime | runtime_error | 272 | 272 | 398484 | 20698 | THREW:ReferenceError: Intl is not defined |
| `luxon` | ^3.4.0 | datetime | runtime_error | 2 | 2 | 74490 | 2408 | THREW:ReferenceError: Intl is not defined |
| `react-dom` | ^18.3.1 | frameworks-render | runtime_error | 5 | 5 | 96486 | 1265 | THREW:Error: Minified React error #31; visit https://reactjs.org/docs/error-decoder.html?invariant=31&args[]=object%20with%20keys%20%7B%24%24typeof%2C%20type%2C%20key%2C%20ref%2C%20props%7D for the full message or use the non-minified dev environment for full errors and additional helpful warnings. |
| `js-md5` | ^0.8.3 | hash-crypto | runtime_error | 2 | 3 | 15609 | 594 | THREW:TypeError: can't access property "from", e is undefined |
| `js-sha1` | ^0.7.0 | hash-crypto | runtime_error | 2 | 3 | 12901 | 644 | THREW:TypeError: can't access property "from", f is undefined |
| `js-sha256` | ^0.11.0 | hash-crypto | runtime_error | 2 | 3 | 14431 | 307 | THREW:TypeError: can't access property "from", i is undefined |
| `sha.js` | ^2.4.11 | hash-crypto | runtime_error | 2 | 3 | 42795 | 548 | THREW:TypeError: E.prototype is not an object or null |
| `node-fetch` | ^3.3.2 | http-url | runtime_error | 2 | 15 | 115468 | 2870 | THREW:TypeError: can't access property "promisify", _utilmjs is null |
| `whatwg-url` | ^14.0.0 | http-url | runtime_error | 2 | 2 | 294155 | 3148 | THREW:TypeError: t.normalize is not a function |
| `supports-color` | ^9.4.0 | logging-color | runtime_error | 2 | 2 | 3872 | 181 | THREW:ReferenceError: navigator is not defined |
| `turndown` | ^7.1.2 | markdown-html | runtime_error | 2 | 2 | 14020 | 1191 | THREW:TypeError: r.createDocument is not a function |
| `xml2js` | ^0.6.2 | parsing | runtime_error | 2 | 6 | 113811 | 1219 | THREW:TypeError: can't access property "reset", this is null |
| `slugify` | ^1.6.6 | string | runtime_error | 2 | 2 | 14277 | 397 | THREW:TypeError: u.normalize is not a function |
| `art-template` | ^4.13.2 | templating | runtime_error | 2 | 10 | 323163 | 4439 | THREW:TypeError: can't access property ".art", Z.extensions is undefined |
| `is-my-json-valid` | ^2.20.6 | validation | runtime_error | 2 | 3 | 32970 | 420 | THREW:SyntaxError: expected expression, got '%' |
| `ow` | ^2.0.0 | validation | runtime_error | 2 | 2 | 47461 | 736 | THREW:ReferenceError: Intl is not defined |
| `cli-truncate` | ^4.0.0 | ansi-string | compile_error | 2 | 2 | 26762 | 349 | invalid property name in regular expression |
| `string-width` | ^7.2.0 | ansi-string | compile_error | 2 | 2 | 21981 | 579 | invalid property name in regular expression |
| `wrap-ansi` | ^9.0.0 | ansi-string | compile_error | 2 | 2 | 26250 | 597 | invalid property name in regular expression |
| `meow` | ^13.2.0 | cli-args | compile_error | 2 | 8 | 170217 | 4277 | invalid class property name in regular expression |
| `humanize-string` | ^3.0.0 | color-format | compile_error | 2 | 2 | 3937 | 326 | invalid class property name in regular expression |
| `parse-duration` | ^1.1.0 | datetime | compile_error | 2 | 2 | 3749 | 246 | invalid class property name in regular expression |
| `marked` | ^11.0.0 | markdown | compile_error | 2 | 2 | 38858 | 865 | invalid class property name in regular expression |
| `micromark` | ^4.0.0 | markdown-html | compile_error | 2 | 2 | 55979 | 881 | invalid property name in regular expression |
| `remark-html` | ^16.0.1 | markdown-html | compile_error | 4 | 4 | 150770 | 4112 | invalid property name in regular expression |
| `camelcase` | ^8.0.0 | string | compile_error | 2 | 2 | 4216 | 251 | invalid class property name in regular expression |
| `change-case` | ^5.4.4 | string | compile_error | 2 | 2 | 6726 | 192 | invalid class property name in regular expression |
| `decamelize` | ^6.0.0 | string | compile_error | 2 | 2 | 3613 | 226 | invalid class property name in regular expression |
| `param-case` | ^4.0.0 | string | compile_error | 2 | 2 | 3584 | 196 | invalid class property name in regular expression |
| `snake-case` | ^4.0.0 | string | compile_error | 2 | 2 | 3584 | 206 | invalid class property name in regular expression |
| `title-case` | ^4.3.1 | string | compile_error | 2 | 2 | 4083 | 169 | invalid class property name in regular expression |
| `liquidjs` | ^10.16.1 | templating | compile_error | 2 | 9 | 94049 | 3829 | invalid class property name in regular expression |
| `valibot` | ^0.42.0 | validation | compile_error | 2 | 2 | 73458 | 3127 | invalid property name in regular expression |
| `marked-terminal` | ^7.1.0 | markdown-html | bundle_error |  |  |  |  | dependency graph too large (1454 KB across 5 modules); this library is too big to bundle in the sandbox — try a smaller alternative |
| `mathjs` | ^12.4.0 | numbers | bundle_error |  |  |  |  | dependency graph too large (704 KB across 3 modules); this library is too big to bundle in the sandbox — try a smaller alternative |
| `pug` | ^3.0.3 | templating | bundle_error |  |  |  |  | dependency graph too large (814 KB across 7 modules); this library is too big to bundle in the sandbox — try a smaller alternative |
