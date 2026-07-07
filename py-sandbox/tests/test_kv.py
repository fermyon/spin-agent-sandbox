import unittest

from _kv import scoped_prefix, ScopedStore


class FakeStore:
    """In-memory stand-in for the Spin default store (bytes values)."""

    def __init__(self):
        self.m = {}

    def get(self, k):
        return self.m.get(k)

    def set(self, k, v):
        self.m[k] = v

    def delete(self, k):
        self.m.pop(k, None)

    def exists(self, k):
        return k in self.m

    def get_keys(self):
        return list(self.m.keys())


class TestScopedPrefix(unittest.TestCase):
    def test_length_prefixed(self):
        self.assertEqual(scoped_prefix("a"), "1:a:")
        self.assertEqual(scoped_prefix("a-b"), "3:a-b:")


class TestIsolation(unittest.TestCase):
    def test_no_prefix_collision(self):
        store = FakeStore()
        victim = ScopedStore(store, scoped_prefix("a-b"))
        victim.set("secret", b"TOP")
        attacker = ScopedStore(store, scoped_prefix("a"))
        # Under the old "{id}-{key}" scheme attacker.get("b-secret") returned b"TOP".
        self.assertIsNone(attacker.get("b-secret"))
        self.assertEqual(attacker.get_keys(), [])

    def test_get_keys_own_only_unprefixed(self):
        store = FakeStore()
        s = ScopedStore(store, scoped_prefix("a-b"))
        s.set("k1", b"1")
        s.set("k2", b"2")
        ScopedStore(store, scoped_prefix("zzz")).set("x", b"9")
        self.assertEqual(sorted(s.get_keys()), ["k1", "k2"])

    def test_get_json_missing_returns_none_and_round_trips(self):
        store = FakeStore()
        s = ScopedStore(store, scoped_prefix("sb"))
        self.assertIsNone(s.get_json("nope"))
        s.set_json("a", {"v": 1})
        self.assertEqual(s.get_json("a"), {"v": 1})

    def test_delete_and_exists_are_scoped(self):
        store = FakeStore()
        s = ScopedStore(store, scoped_prefix("sb"))
        s.set("k", b"v")
        self.assertTrue(s.exists("k"))
        self.assertTrue(store.exists("2:sb:k"))  # physical key is length-prefixed
        s.delete("k")
        self.assertFalse(s.exists("k"))


if __name__ == "__main__":
    unittest.main()
