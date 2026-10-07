import unittest

from executor_logic import build_request, iter_chunks, normalize_response, run_code


class TestBuildRequest(unittest.TestCase):
    def test_defaults(self):
        self.assertEqual(build_request(), {"method": "GET", "uri": "/", "headers": {}, "body": None})

    def test_passes_through_method_path_headers_body(self):
        r = build_request(method="POST", path="/api/data", headers={"content-type": "application/json"}, body=b'{"x": 1}')
        self.assertEqual(r, {"method": "POST", "uri": "/api/data", "headers": {"content-type": "application/json"}, "body": b'{"x": 1}'})

    def test_query_params_appended_with_question_mark(self):
        r = build_request(path="/search", query=[("q", "hello"), ("page", "1")])
        self.assertEqual(r["uri"], "/search?q=hello&page=1")

    def test_query_params_appended_with_ampersand_when_existing(self):
        r = build_request(path="/search?existing=1", query=[("q", "hello")])
        self.assertEqual(r["uri"], "/search?existing=1&q=hello")


class TestNormalizeResponse(unittest.TestCase):
    def test_object_with_status_headers_body(self):
        class Resp:
            status = 201
            headers = {"x-custom": "val"}
            body = b"payload"

        status, headers, body = normalize_response(Resp())
        self.assertEqual(status, 201)
        self.assertIn(("x-custom", "val"), headers)
        self.assertEqual(body, b"payload")

    def test_tuple_response(self):
        status, headers, body = normalize_response((202, {"x": "y"}, b"data"))
        self.assertEqual((status, body), (202, b"data"))
        self.assertIn(("x", "y"), headers)

    def test_string_body_is_encoded(self):
        _, _, body = normalize_response((200, {}, "hello"))
        self.assertEqual(body, b"hello")

    def test_none_body_defaults_to_empty(self):
        _, _, body = normalize_response((200, {}, None))
        self.assertEqual(body, b"")

    def test_iterable_body_is_not_buffered(self):
        def body():
            yield "first"
            yield b"second"

        _, _, stream = normalize_response((200, {}, body()))
        self.assertEqual(list(iter_chunks(stream)), [b"first", b"second"])

    def test_scalar_value_defaults_200(self):
        status, _, body = normalize_response(42)
        self.assertEqual((status, body), (200, b"42"))

    def test_list_header_values_are_expanded(self):
        class Resp:
            status = 200
            headers = {"set-cookie": ["a=1", "b=2"]}
            body = b""

        _, headers, _ = normalize_response(Resp())
        self.assertIn(("set-cookie", "a=1"), headers)
        self.assertIn(("set-cookie", "b=2"), headers)


class TestIterChunks(unittest.TestCase):
    def test_empty_body_yields_nothing(self):
        self.assertEqual(list(iter_chunks(b"")), [])

    def test_small_body_is_one_chunk(self):
        self.assertEqual(list(iter_chunks(b"hello")), [b"hello"])

    def test_splits_at_chunk_size(self):
        data = b"x" * 100_000
        chunks = list(iter_chunks(data))
        self.assertEqual(chunks, [b"x" * 65536, b"x" * 34464])

    def test_exact_boundary_is_one_chunk(self):
        data = b"y" * 65536
        self.assertEqual(list(iter_chunks(data)), [data])

    def test_stream_chunks_are_pulled_lazily(self):
        pulled = []

        def body():
            pulled.append("first")
            yield b"first"
            pulled.append("second")
            yield b"second"

        chunks = iter_chunks(iter(body()))
        self.assertEqual(pulled, [])
        self.assertEqual(next(chunks), b"first")
        self.assertEqual(pulled, ["first"])
        self.assertEqual(next(chunks), b"second")
        self.assertEqual(pulled, ["first", "second"])

    def test_stream_rejects_non_byte_chunks(self):
        with self.assertRaisesRegex(TypeError, "bytes or str"):
            list(iter_chunks(iter([b"ok", 1])))


class TestRunCode(unittest.TestCase):
    REQ = {"method": "GET", "uri": "/", "headers": {}, "body": None}

    def test_syntax_error_is_compile_error(self):
        kind, message = run_code("def (", self.REQ)
        self.assertEqual(kind, "compile_error")
        self.assertTrue(message)

    def test_plain_script_is_main_with_no_error(self):
        result = run_code("x = 1 + 1", self.REQ)
        self.assertEqual(result, ("main", None))

    def test_uncaught_exception_is_main_error(self):
        kind, traceback_str = run_code("raise ValueError('boom')", self.REQ)
        self.assertEqual(kind, "main_error")
        self.assertIn("boom", traceback_str)

    def test_handle_request_shape_returns_handler_response(self):
        code = "def handle_request(req):\n    return (200, {'content-type': 'text/plain'}, 'hi')"
        kind, status, headers, body = run_code(code, self.REQ)
        self.assertEqual(kind, "handler_response")
        self.assertEqual(status, 200)
        self.assertIn(("content-type", "text/plain"), headers)
        self.assertEqual(body, b"hi")

    def test_handle_request_receives_the_request_fields(self):
        code = "def handle_request(req):\n    return (200, {}, req.method + ' ' + req.uri)"
        req = build_request(method="POST", path="/x", query=[("a", "1")])
        _, _, _, body = run_code(code, req)
        self.assertEqual(body, b"POST /x?a=1")

    def test_handle_request_can_return_a_streaming_body(self):
        code = """def handle_request(req):
    def body():
        yield 'first'
        yield b'second'
    return (200, {'content-type': 'text/plain'}, body())
"""
        _, status, _, body = run_code(code, self.REQ)
        self.assertEqual(status, 200)
        self.assertEqual(list(iter_chunks(body)), [b"first", b"second"])

    def test_handler_that_raises_is_handler_error(self):
        code = "def handle_request(req):\n    raise RuntimeError('nope')"
        kind, traceback_str = run_code(code, self.REQ)
        self.assertEqual(kind, "handler_error")
        self.assertIn("nope", traceback_str)


if __name__ == "__main__":
    unittest.main()
