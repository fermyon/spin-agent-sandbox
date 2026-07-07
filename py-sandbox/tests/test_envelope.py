import json
import unittest

from _envelope import validate_envelope, build_request_args, MAX_CODE, MAX_BODY


class TestValidateEnvelope(unittest.TestCase):
    def test_missing_body(self):
        env, err = validate_envelope(None)
        self.assertIsNone(env)
        self.assertEqual(err["status"], 400)
        self.assertEqual(err["error"], "invalid_envelope")

    def test_body_too_large(self):
        env, err = validate_envelope(b"x" * (MAX_BODY + 1))
        self.assertEqual(err["status"], 413)
        self.assertEqual(err["error"], "body_too_large")

    def test_invalid_json(self):
        env, err = validate_envelope(b"{not json")
        self.assertEqual(err["status"], 400)
        self.assertEqual(err["error"], "invalid_json")

    def test_missing_or_mistyped_fields(self):
        env, err = validate_envelope(json.dumps({"code": "x"}).encode())
        self.assertEqual(err["error"], "invalid_envelope")
        env, err = validate_envelope(json.dumps({"code": 1, "sandboxId": "s"}).encode())
        self.assertEqual(err["error"], "invalid_envelope")

    def test_code_too_large(self):
        big = {"code": "x" * (MAX_CODE + 1), "sandboxId": "s"}
        env, err = validate_envelope(json.dumps(big).encode())
        self.assertEqual(err["status"], 413)
        self.assertEqual(err["error"], "code_too_large")

    def test_valid(self):
        env, err = validate_envelope(json.dumps({"code": "print(1)", "sandboxId": "s"}).encode())
        self.assertIsNone(err)
        self.assertEqual(env["sandboxId"], "s")


class TestBuildRequestArgs(unittest.TestCase):
    def test_get_no_body_sets_query(self):
        method, uri, headers, body = build_request_args({"method": "get", "query": {"n": "ada", "x": 2}})
        self.assertEqual(method, "GET")
        self.assertIn("n=ada", uri)
        self.assertIn("x=2", uri)
        self.assertIsNone(body)

    def test_post_object_body_is_json(self):
        method, uri, headers, body = build_request_args({"method": "POST", "body": {"a": 1}})
        self.assertEqual(method, "POST")
        self.assertEqual(body, b'{"a": 1}')

    def test_post_string_body_passthrough(self):
        method, uri, headers, body = build_request_args({"method": "POST", "body": "raw"})
        self.assertEqual(body, b"raw")

    def test_headers_lowercased_and_stringified(self):
        method, uri, headers, body = build_request_args({"headers": {"Content-Type": "application/json"}})
        self.assertEqual(headers, {"content-type": "application/json"})

    def test_empty_input_defaults(self):
        method, uri, headers, body = build_request_args(None)
        self.assertEqual(method, "GET")
        self.assertEqual(uri, "/")
        self.assertIsNone(body)


if __name__ == "__main__":
    unittest.main()
