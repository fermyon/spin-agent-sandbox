"""Scoped key-value store logic (pure; no spin_sdk import so it is unit-testable).

There is one shared `default` store; each sandbox sees only its own keys, namespaced as
f"{len(sandboxId)}:{sandboxId}:{key}".

The length-prefixed separator is what makes the namespace UNAMBIGUOUS: a bare
"{sandboxId}-{key}" separator collides because "-" is also a legal sandboxId character
(id "a" + key "b-k" and id "a-b" + key "k" both map to "a-b-k", so a sandbox whose id is a
"-"-boundary prefix of another could read/write/enumerate its keys). Prefixing the id with
its length removes that ambiguity for any id.

`ScopedStore` is a faithful drop-in for the documented Spin SDK key-value API:
  - canonical:  get / set / delete / exists / get_keys (bytes) + context manager.
  - plus get_json / set_json (matching the Spin TypeScript SDK) as a convenience.
"""

import json


def scoped_prefix(sandbox_id):
    return f"{len(sandbox_id)}:{sandbox_id}:"


class ScopedStore:
    def __init__(self, inner, prefix):
        self._inner = inner
        self._p = prefix

    def get(self, key):
        return self._inner.get(self._p + key)

    def set(self, key, value):
        self._inner.set(self._p + key, value)

    def delete(self, key):
        self._inner.delete(self._p + key)

    def exists(self, key):
        return self._inner.exists(self._p + key)

    def get_keys(self):
        n = len(self._p)
        return [k[n:] for k in self._inner.get_keys() if k.startswith(self._p)]

    # Conveniences (mirror the Spin TypeScript SDK); not in the canonical Python SDK.
    def get_json(self, key):
        raw = self.get(key)
        return None if raw is None else json.loads(raw)

    def set_json(self, key, value):
        self.set(key, json.dumps(value).encode())

    def __enter__(self):
        return self

    def __exit__(self, *a):
        ex = getattr(self._inner, "__exit__", None)
        return ex(*a) if ex is not None else False
