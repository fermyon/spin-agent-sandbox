import unittest

from executor_logic import build_request, iter_chunks, normalize_response, run_code, wit_text


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

    def test_mapping_and_set_bodies_are_rejected(self):
        for body in ({"a": 1}, {"a"}):
            with self.assertRaises(TypeError):
                normalize_response((200, {}, body))

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

    def test_base_exceptions_in_main_are_main_error(self):
        for code in ("raise KeyboardInterrupt", "raise BaseException('base')", "import sys; sys.exit(3)"):
            with self.subTest(code=code):
                kind, traceback_str = run_code(code, self.REQ)
                self.assertEqual(kind, "main_error")
                self.assertTrue(traceback_str)

    def test_clean_sys_exit_ends_main_normally(self):
        for code in ("import sys; sys.exit()", "import sys; sys.exit(0)"):
            with self.subTest(code=code):
                self.assertEqual(run_code(code, self.REQ), ("main", None))

    def test_base_exceptions_in_handler_are_handler_error(self):
        for raise_stmt in ("raise KeyboardInterrupt", "raise SystemExit(0)", "raise BaseException('base')"):
            with self.subTest(raise_stmt=raise_stmt):
                code = f"def handle_request(req):\n    {raise_stmt}"
                kind, traceback_str = run_code(code, self.REQ)
                self.assertEqual(kind, "handler_error")
                self.assertTrue(traceback_str)

    def test_invalid_status_is_handler_error(self):
        for status in ("'ok'", "70000", "99", "True", "None", "200.0"):
            with self.subTest(status=status):
                code = f"def handle_request(req):\n    return ({status}, {{}}, b'')"
                kind, traceback_str = run_code(code, self.REQ)
                self.assertEqual(kind, "handler_error")
                self.assertIn("status", traceback_str)

    def test_unencodable_header_is_handler_error(self):
        code = "def handle_request(req):\n    return (200, {'x': '\\ud800'}, b'')"
        kind, _ = run_code(code, self.REQ)
        self.assertEqual(kind, "handler_error")

    def test_error_text_is_always_utf8_encodable(self):
        kind, traceback_str = run_code("raise Exception('\\ud800')", self.REQ)
        self.assertEqual(kind, "main_error")
        traceback_str.encode("utf-8")
        self.assertIn("\\ud800", traceback_str)

    def test_handler_error_with_unprintable_exception_is_reported(self):
        code = (
            "class Bad(Exception):\n"
            "    def __str__(self):\n"
            "        raise RuntimeError('no str')\n"
            "def handle_request(req):\n"
            "    raise Bad()"
        )
        kind, traceback_str = run_code(code, self.REQ)
        self.assertEqual(kind, "handler_error")
        self.assertIn("Bad", traceback_str)


class TestWitText(unittest.TestCase):
    def test_lone_surrogate_is_escaped(self):
        self.assertEqual(wit_text("a\ud800b"), "a\\ud800b")

    def test_unprintable_value_falls_back_to_type_name(self):
        class Bad:
            def __str__(self):
                raise KeyboardInterrupt

        self.assertEqual(wit_text(Bad()), "<unprintable Bad>")


if __name__ == "__main__":
    unittest.main()
