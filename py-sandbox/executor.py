"""Execute user code and return sandbox outcomes."""

from typing import Optional

# Unused here, but user code imports `spin_sdk`/`spin_sdk.http`/`spin_sdk.key_value`
# dynamically via `exec()`, which componentize-py's static import tracing never sees —
# importing them eagerly forces componentize-py to bundle the modules into the component.
import spin_sdk.http  # noqa: F401
import spin_sdk.key_value  # noqa: F401

# Same reasoning as above, for the vendored packages user code is told it can import
# (README, sdk/src/tools.ts). These are required: a failed import here would silently
# leave the package out of the component, so it must fail the build instead.
import numpy  # noqa: F401
import tabulate  # noqa: F401
import markdown  # noqa: F401
import markupsafe  # noqa: F401
import jinja2  # noqa: F401
import regex  # noqa: F401
import bs4  # noqa: F401
import soupsieve  # noqa: F401
import urllib.parse  # noqa: F401
import yaml  # noqa: F401
import sqlalchemy  # noqa: F401
import sqlalchemy.dialects.sqlite  # noqa: F401
import tiktoken  # noqa: F401
# tiktoken_ext.openai_public is deliberately not bundled: it imports `requests` (not
# vendored) and downloads the BPE rank files at runtime, which the sandbox cannot do.
# So tiktoken.get_encoding("cl100k_base") and friends fail, but the core tokenizer
# works with ranks the caller supplies (tiktoken.Encoding(..., mergeable_ranks=...)).
import charset_normalizer  # noqa: F401
import yarl  # noqa: F401
import multidict  # noqa: F401
import frozenlist  # noqa: F401
import wrapt  # noqa: F401
import pydantic

# pydantic resolves its public names lazily (`pydantic.BaseModel` imports pydantic.main
# on first use), so `import pydantic` alone bundles almost none of it. Resolve them all.
# This also fails the build if pydantic and the prebuilt pydantic_core disagree.
import warnings

with warnings.catch_warnings():
    warnings.simplefilter("ignore", DeprecationWarning)
    for _name in pydantic.__all__:
        getattr(pydantic, _name)

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

