import unittest

from _egress import is_internal_host, host_allowed


class TestIsInternalHost(unittest.TestCase):
    def test_internal_blocked(self):
        internal = [
            "localhost", "LOCALHOST", "", "svc.internal", "backend.spin.internal",
            "y.local", "z.localhost",
            "127.0.0.1", "0.0.0.0", "169.254.169.254", "10.0.0.5",
            "172.16.0.1", "172.31.255.255", "192.168.1.1",
            "::1", "fc00::1", "fd12::34", "fe80::1",
            # IPv4-mapped IPv6, dotted and hex forms (kept in parity with the TS backstop).
            "::ffff:127.0.0.1", "::ffff:169.254.169.254", "::ffff:a9fe:a9fe", "::ffff:7f00:1",
        ]
        for h in internal:
            self.assertTrue(is_internal_host(h), h)

    def test_public_allowed(self):
        public = [
            "example.com", "api.example.com", "8.8.8.8", "172.32.0.1", "193.0.0.1", "2606:4700::1",
            "::ffff:8.8.8.8", "::ffff:0808:0808",  # mapped public — must NOT be over-blocked
        ]
        for h in public:
            self.assertFalse(is_internal_host(h), h)


class TestHostAllowed(unittest.TestCase):
    def test_default_deny(self):
        self.assertFalse(host_allowed("https://example.com/", []))

    def test_exact_and_wildcard(self):
        self.assertTrue(host_allowed("https://example.com/", ["example.com"]))
        self.assertTrue(host_allowed("https://api.example.com/", ["*.example.com"]))
        self.assertTrue(host_allowed("https://example.com/", ["*.example.com"]))
        self.assertFalse(host_allowed("https://evil.com/", ["example.com"]))
        self.assertFalse(host_allowed("https://notexample.com/", ["*.example.com"]))

    def test_wildcard_label_boundary(self):
        for bad in ("evil-example.com", "example.com.evil.com", "xexample.com"):
            self.assertFalse(host_allowed(f"https://{bad}/", ["*.example.com"]), bad)

    def test_bare_star_ignored(self):
        self.assertFalse(host_allowed("https://anything.com/", ["*"]))

    def test_internal_denied_even_if_listed(self):
        self.assertFalse(host_allowed("http://169.254.169.254/", ["169.254.169.254"]))
        self.assertFalse(host_allowed("http://localhost/", ["localhost"]))

    def test_scheme_stripped_from_pattern(self):
        self.assertTrue(host_allowed("https://example.com/", ["https://example.com"]))


if __name__ == "__main__":
    unittest.main()
