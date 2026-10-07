"""Execute user code and return sandbox outcomes."""

from typing import Optional

# Unused here, but user code imports `spin_sdk`/`spin_sdk.http`/`spin_sdk.key_value`
# dynamically via `exec()`, which componentize-py's static import tracing never sees —
# importing them eagerly forces componentize-py to bundle the modules into the component.
import spin_sdk.http  # noqa: F401
import spin_sdk.key_value  # noqa: F401

# Same reasoning as above, for the vendored packages examples/ai-code-executor
# expects user code to be able to import — these must import cleanly.
import numpy  # noqa: F401
import tabulate  # noqa: F401
import markdown  # noqa: F401
import markupsafe  # noqa: F401
import jinja2  # noqa: F401
import regex  # noqa: F401
import bs4  # noqa: F401
import soupsieve  # noqa: F401
import urllib.parse  # noqa: F401

# Best-effort extras: a missing/flaky one must not break the component's own load.
for _mod in (
    "yaml",
    "sqlalchemy",
    "sqlalchemy.dialects.sqlite",
    "pydantic",
    "pydantic_core",
    "tiktoken",
    "tiktoken_ext.openai_public",
    "charset_normalizer",
    "yarl",
    "multidict",
    "frozenlist",
    "wrapt",
):
    try:
        __import__(_mod)
    except Exception:  # noqa: BLE001
        pass

from wit_world.exports.executor import (
    BodyChunk,
    BodyChunk_Chunk,
    BodyChunk_Done,
    BodyChunk_Error,
    HandlerResponse,
    Outcome,
    Outcome_CompileError,
    Outcome_HandlerError,
    Outcome_HandlerResponse,
    Outcome_Main,
    RunInput,
)

from executor_logic import build_request, iter_chunks, run_code


class _ResponseStream:
    """Pull a buffered body or user-supplied iterable through the WIT stream."""

    def __init__(self, body: bytes):
        self._chunks = iter_chunks(body)

    def read(self) -> BodyChunk:
        if self._chunks is None:
            return BodyChunk_Done()
        try:
            chunk = next(self._chunks)
        except StopIteration:
            self._chunks = None
            return BodyChunk_Done()
        except Exception as error:  # A user generator can fail after headers are sent.
            self._chunks = None
            return BodyChunk_Error(str(error))
        return BodyChunk_Chunk(chunk)


class Executor:
    """Implements sandbox:guard/executor."""

    @staticmethod
    def run(code: str, input: Optional[RunInput]) -> Outcome:
        """Execute user code and return the outcome."""
        if input is None:
            request = build_request()
        else:
            request = build_request(input.method, input.path, input.headers, input.query, input.body)

        result = run_code(code, request)
        kind = result[0]
        if kind == "compile_error":
            return Outcome_CompileError(value=result[1])
        if kind == "main":
            return Outcome_Main(value=None)
        if kind == "main_error":
            return Outcome_Main(value=result[1])
        if kind == "handler_error":
            return Outcome_HandlerError(value=result[1])
        _, status, headers, body = result
        return Outcome_HandlerResponse(value=HandlerResponse(status=status, headers=headers, body=_ResponseStream(body)))

