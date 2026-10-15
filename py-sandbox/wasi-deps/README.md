# Prebuilt wasm32-wasi Python packages

Python packages with native extensions, prebuilt for CPython 3.12 on `wasm32-wasi`
(`*.cpython-312-wasm32-wasi.so`). `../setup-vendor.sh` copies them into `vendor/`, where
`componentize-py` links them into `py-sandbox.wasm`. Pure-Python dependencies are not
here; `setup-vendor.sh` installs them from `../vendor-requirements.txt`.

They were built by [dicej/wasi-wheels](https://github.com/dicej/wasi-wheels), which
pins each upstream project as a git submodule. They were previously pulled in through the
`spin-python-deps` git submodule (commit `864c190`) and are committed directly so the
build does not depend on a third-party repository. They are unchanged apart from removing
`__pycache__/`.

The commit column is the upstream source each package was built from, as pinned by
wasi-wheels. The version strings and sampled source files match those commits. Each
license file in `LICENSES/` was taken from that same commit.

| Directory | Upstream project | Version | Commit | License | License file |
|---|---|---|---|---|---|
| `charset_normalizer` | [jawah/charset_normalizer](https://github.com/jawah/charset_normalizer) | 3.3.2 | `60b7c81` | MIT | `charset_normalizer.txt` |
| `frozenlist` | [aio-libs/frozenlist](https://github.com/aio-libs/frozenlist) | 1.4.2.dev0 | `bbe041d` | Apache-2.0 | `frozenlist.txt` |
| `multidict` | [aio-libs/multidict](https://github.com/aio-libs/multidict) | 6.0.5.dev0 | `82b559c` | Apache-2.0 | `multidict.txt`, `Apache-2.0.txt` |
| `numpy` | [numpy/numpy](https://github.com/numpy/numpy) | 1.26.0b1 | `7bc1803` | BSD-3-Clause, plus bundled licenses | `numpy.txt`, `numpy-bundled.txt` |
| `pydantic_core` | [pydantic/pydantic-core](https://github.com/pydantic/pydantic-core) | 2.14.5 | `ea3ec7e` | MIT | `pydantic_core.txt` |
| `regex` | [mrabarnett/mrab-regex](https://github.com/mrabarnett/mrab-regex) | 2023.10.3 (module 2.5.135) | `34333d5` | Apache-2.0 and CNRI-Python | `regex.txt` |
| `sqlalchemy` | [sqlalchemy/sqlalchemy](https://github.com/sqlalchemy/sqlalchemy) | 2.1.0b1 | `b12b7b1` | MIT | `sqlalchemy.txt` |
| `tiktoken`, `tiktoken_ext` | [openai/tiktoken](https://github.com/openai/tiktoken) | 0.5.2 | `9e79899` | MIT | `tiktoken.txt` |
| `wrapt` | [GrahamDumpleton/wrapt](https://github.com/GrahamDumpleton/wrapt) | 1.16.0 | `5c0997c` | BSD-2-Clause | `wrapt.txt` |
| `yaml`, `_yaml` | [yaml/pyyaml](https://github.com/yaml/pyyaml) | 6.0.1 | `48838a3` | MIT | `pyyaml.txt` |
| `yarl` | [aio-libs/yarl](https://github.com/aio-libs/yarl) | 1.9.5.dev0 | `801a35f` | Apache-2.0 | `yarl.txt`, `yarl-NOTICE.txt` |

At its pinned commit, multidict's license file is only the short Apache-2.0 notice, so
the full license text is included as `Apache-2.0.txt`.

To add or update a package, drop its built directory here, add it to the `PREBUILT`
list in `../setup-vendor.sh`, record it in this table with its source commit and the license file from that commit, then run
`rm -rf ../vendor` so the next build regenerates `vendor/`.
