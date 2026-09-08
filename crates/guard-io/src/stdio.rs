//! Exported `wasi:cli/stdout`/`stderr` + `wasi:io/streams` — what the guest's
//! `console.log`/`console.error` write to. `get-stdout`/`get-stderr` allocate a
//! request-scoped, size-capped buffer; `context::take_captured_output` drains
//! them after `executor.run` returns. `wasi:io/streams` is exported here (not
//! just stdout/stderr) because wit-bindgen requires the component that mints a
//! new output-stream resource to own every interface referencing that type —
//! see `wit/world.wit`. HTTP bodies reuse this same stream type via a
//! `Passthrough` variant that forwards to the real host; only stdout/stderr
//! actually buffer.

use crate::bindings::exports::wasi::io::streams as guarded;
use crate::bindings::wasi::io::poll::Pollable as RealPollable;
use crate::bindings::wasi::io::streams::{
    InputStream as RealInputStream, OutputStream as RealOutputStream, StreamError as RealStreamError,
};
use std::cell::RefCell;

/// Matches the reference implementation's `console.ts` cap — once a captured
/// stream exceeds this many bytes, further writes are dropped and a single
/// truncation marker is appended.
pub const MAX_CAPTURED_BYTES: usize = 256 * 1024;

thread_local! {
    static STDOUT_BUF: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
    static STDERR_BUF: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
}

fn append_capped(buf: &RefCell<Vec<u8>>, bytes: &[u8]) {
    let mut b = buf.borrow_mut();
    if b.len() >= MAX_CAPTURED_BYTES {
        return;
    }
    let remaining = MAX_CAPTURED_BYTES - b.len();
    if bytes.len() > remaining {
        b.extend_from_slice(&bytes[..remaining]);
        b.extend_from_slice(b"...[truncated]");
    } else {
        b.extend_from_slice(bytes);
    }
}

/// Like `append_capped`, but for `write-zeroes(len)`, whose whole point is
/// requesting a zero-fill without the caller holding `len` bytes anywhere —
/// so `len` must never be used to size an allocation before capping it, or a
/// single call with a huge `len` (up to `u64::MAX`) is a host-side memory-
/// exhaustion DoS.
fn append_zeroes_capped(buf: &RefCell<Vec<u8>>, len: u64) {
    let mut b = buf.borrow_mut();
    if b.len() >= MAX_CAPTURED_BYTES {
        return;
    }
    let remaining = MAX_CAPTURED_BYTES - b.len();
    let to_write = usize::try_from(len).unwrap_or(usize::MAX).min(remaining);
    let new_len = b.len() + to_write;
    b.resize(new_len, 0);
    if len > remaining as u64 {
        b.extend_from_slice(b"...[truncated]");
    }
}

/// Drains both captured buffers (as lossy UTF-8, matching the reference
/// implementation's string-based capture) and resets them for the next
/// request.
pub fn take_captured() -> (String, String) {
    let out = STDOUT_BUF.with(|b| String::from_utf8_lossy(&std::mem::take(&mut *b.borrow_mut())).into_owned());
    let err = STDERR_BUF.with(|b| String::from_utf8_lossy(&std::mem::take(&mut *b.borrow_mut())).into_owned());
    (out, err)
}

/// `wasi:io/error`'s `error` resource isn't exported by this component (it's
/// not shared with any interface we own the way streams/http-types are), so
/// it stays uniformly "the real one" on both sides — only the `stream-error`
/// variant *tag* itself needs remapping between the real and exported
/// binding modules.
fn map_stream_error(e: RealStreamError) -> guarded::StreamError {
    match e {
        RealStreamError::LastOperationFailed(err) => guarded::StreamError::LastOperationFailed(err),
        RealStreamError::Closed => guarded::StreamError::Closed,
    }
}

pub enum Stream {
    Stdout,
    Stderr,
    /// ts-sandbox never legitimately reads stdin; always reports EOF.
    Stdin,
    PassthroughOutput(RealOutputStream),
    PassthroughInput(RealInputStream),
}

impl Stream {
    pub fn wrap_real_output(real: RealOutputStream) -> guarded::OutputStream {
        guarded::OutputStream::new(Stream::PassthroughOutput(real))
    }

    pub fn wrap_real_input(real: RealInputStream) -> guarded::InputStream {
        guarded::InputStream::new(Stream::PassthroughInput(real))
    }
}

impl guarded::GuestOutputStream for Stream {
    fn check_write(&self) -> Result<u64, guarded::StreamError> {
        match self {
            Stream::Stdout | Stream::Stderr => Ok(MAX_CAPTURED_BYTES as u64),
            Stream::PassthroughOutput(real) => real.check_write().map_err(map_stream_error),
            Stream::Stdin | Stream::PassthroughInput(_) => unreachable!("input-stream never backs an output-stream"),
        }
    }

    fn write(&self, contents: Vec<u8>) -> Result<(), guarded::StreamError> {
        match self {
            Stream::Stdout => {
                STDOUT_BUF.with(|b| append_capped(b, &contents));
                Ok(())
            }
            Stream::Stderr => {
                STDERR_BUF.with(|b| append_capped(b, &contents));
                Ok(())
            }
            Stream::PassthroughOutput(real) => real.write(&contents).map_err(map_stream_error),
            Stream::Stdin | Stream::PassthroughInput(_) => unreachable!(),
        }
    }

    fn blocking_write_and_flush(&self, contents: Vec<u8>) -> Result<(), guarded::StreamError> {
        self.write(contents)
    }

    fn flush(&self) -> Result<(), guarded::StreamError> {
        match self {
            Stream::Stdout | Stream::Stderr => Ok(()),
            Stream::PassthroughOutput(real) => real.flush().map_err(map_stream_error),
            Stream::Stdin | Stream::PassthroughInput(_) => unreachable!(),
        }
    }

    fn blocking_flush(&self) -> Result<(), guarded::StreamError> {
        self.flush()
    }

    fn subscribe(&self) -> RealPollable {
        match self {
            Stream::PassthroughOutput(real) => real.subscribe(),
            Stream::PassthroughInput(real) => real.subscribe(),
            // StarlingMonkey's console writes synchronously via
            // blocking-write-and-flush; it never subscribes on stdout/stderr.
            // Nor does it ever subscribe on stdin as an *output* stream (it
            // isn't one).
            Stream::Stdout | Stream::Stderr | Stream::Stdin => {
                unreachable!("buffering stdout/stderr streams are never polled")
            }
        }
    }

    fn write_zeroes(&self, len: u64) -> Result<(), guarded::StreamError> {
        match self {
            Stream::Stdout => {
                STDOUT_BUF.with(|b| append_zeroes_capped(b, len));
                Ok(())
            }
            Stream::Stderr => {
                STDERR_BUF.with(|b| append_zeroes_capped(b, len));
                Ok(())
            }
            Stream::PassthroughOutput(real) => real.write_zeroes(len).map_err(map_stream_error),
            Stream::Stdin | Stream::PassthroughInput(_) => unreachable!(),
        }
    }

    fn blocking_write_zeroes_and_flush(&self, len: u64) -> Result<(), guarded::StreamError> {
        self.write_zeroes(len)
    }

    fn splice(&self, src: guarded::InputStreamBorrow<'_>, len: u64) -> Result<u64, guarded::StreamError> {
        // Only ever meaningful for the HTTP passthrough case (copying a real
        // incoming-body stream into a real outgoing-body stream); stdout/stderr
        // splicing isn't exercised by ts-sandbox.
        match self {
            Stream::PassthroughOutput(real) => {
                let src: &Stream = src.get();
                match src {
                    Stream::PassthroughInput(real_src) => real.splice(real_src, len).map_err(map_stream_error),
                    _ => Err(guarded::StreamError::Closed),
                }
            }
            _ => Err(guarded::StreamError::Closed),
        }
    }

    fn blocking_splice(&self, src: guarded::InputStreamBorrow<'_>, len: u64) -> Result<u64, guarded::StreamError> {
        self.splice(src, len)
    }
}

impl guarded::GuestInputStream for Stream {
    fn read(&self, len: u64) -> Result<Vec<u8>, guarded::StreamError> {
        match self {
            Stream::PassthroughInput(real) => real.read(len).map_err(map_stream_error),
            _ => Err(guarded::StreamError::Closed),
        }
    }

    fn blocking_read(&self, len: u64) -> Result<Vec<u8>, guarded::StreamError> {
        match self {
            Stream::PassthroughInput(real) => real.blocking_read(len).map_err(map_stream_error),
            _ => Err(guarded::StreamError::Closed),
        }
    }

    fn skip(&self, len: u64) -> Result<u64, guarded::StreamError> {
        match self {
            Stream::PassthroughInput(real) => real.skip(len).map_err(map_stream_error),
            _ => Err(guarded::StreamError::Closed),
        }
    }

    fn blocking_skip(&self, len: u64) -> Result<u64, guarded::StreamError> {
        match self {
            Stream::PassthroughInput(real) => real.blocking_skip(len).map_err(map_stream_error),
            _ => Err(guarded::StreamError::Closed),
        }
    }

    fn subscribe(&self) -> RealPollable {
        match self {
            Stream::PassthroughInput(real) => real.subscribe(),
            _ => unreachable!("only the HTTP passthrough case subscribes on an input-stream"),
        }
    }
}

pub struct GuestStdin;

impl crate::bindings::exports::wasi::cli::stdin::Guest for GuestStdin {
    fn get_stdin() -> guarded::InputStream {
        guarded::InputStream::new(Stream::Stdin)
    }
}

pub struct Stdout;

impl crate::bindings::exports::wasi::cli::stdout::Guest for Stdout {
    fn get_stdout() -> guarded::OutputStream {
        guarded::OutputStream::new(Stream::Stdout)
    }
}

pub struct Stderr;

impl crate::bindings::exports::wasi::cli::stderr::Guest for Stderr {
    fn get_stderr() -> guarded::OutputStream {
        guarded::OutputStream::new(Stream::Stderr)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accumulates_under_the_cap() {
        let buf = RefCell::new(Vec::new());
        append_capped(&buf, b"hello");
        append_capped(&buf, b" world");
        assert_eq!(&*buf.borrow(), b"hello world");
    }

    #[test]
    fn truncates_once_when_exceeding_the_cap() {
        let buf = RefCell::new(vec![0u8; MAX_CAPTURED_BYTES - 3]);
        append_capped(&buf, b"abcdef");
        let contents = buf.borrow();
        assert_eq!(contents.len(), MAX_CAPTURED_BYTES + b"...[truncated]".len());
        assert!(contents.ends_with(b"...[truncated]"));
    }

    #[test]
    fn writes_past_the_cap_are_noops() {
        let buf = RefCell::new(vec![0u8; MAX_CAPTURED_BYTES]);
        append_capped(&buf, b"more");
        assert_eq!(buf.borrow().len(), MAX_CAPTURED_BYTES);
    }

    #[test]
    fn write_zeroes_never_allocates_more_than_the_cap() {
        // A guest requesting close to u64::MAX zero bytes must not make the
        // host try to allocate that much memory before capping.
        let buf = RefCell::new(Vec::new());
        append_zeroes_capped(&buf, u64::MAX);
        let contents = buf.borrow();
        assert_eq!(contents.len(), MAX_CAPTURED_BYTES + b"...[truncated]".len());
        assert!(contents.ends_with(b"...[truncated]"));
    }

    #[test]
    fn write_zeroes_under_the_cap_is_exact() {
        let buf = RefCell::new(Vec::new());
        append_zeroes_capped(&buf, 5);
        assert_eq!(&*buf.borrow(), &[0u8; 5]);
    }

    #[test]
    fn take_captured_drains_and_resets() {
        STDOUT_BUF.with(|b| *b.borrow_mut() = b"out".to_vec());
        STDERR_BUF.with(|b| *b.borrow_mut() = b"err".to_vec());
        let (out, err) = take_captured();
        assert_eq!(out, "out");
        assert_eq!(err, "err");
        assert_eq!(take_captured(), (String::new(), String::new()));
    }
}
