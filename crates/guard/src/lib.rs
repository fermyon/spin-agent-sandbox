//! The real Spin HTTP entry point for the TS/JS sandbox: parses the envelope,
//! enforces size limits, sets guard-io's per-request sandboxId, then calls the
//! JS guest via `sandbox:guard/executor`. See ARCHITECTURE.md for the full architecture.

wit_bindgen::generate!({
    path: "wit",
    world: "guard-front",
    generate_all,
});

mod envelope;
mod logging;

use sandbox::guard::{context, executor};
use envelope::{EnvelopeError, RawInput};
use spin_sdk::http::{IntoResponse, Method, Request, Response};
use spin_sdk::http_component;

fn build_run_input(input: &RawInput) -> executor::RunInput {
    executor::RunInput {
        method: input.method.clone().unwrap_or_else(|| "GET".to_string()),
        path: input.path.clone().unwrap_or_else(|| "/".to_string()),
        headers: input.headers.clone().unwrap_or_default().into_iter().collect(),
        query: input.query.clone().unwrap_or_default().into_iter().collect(),
        body: input.body.as_ref().map(|b| match b {
            serde_json::Value::String(s) => s.clone().into_bytes(),
            other => other.to_string().into_bytes(),
        }),
    }
}

fn json_error(status: u16, kind: &str, message: &str) -> Response {
    Response::builder()
        .status(status)
        .header("content-type", "application/json")
        .body(serde_json::json!({ "error": kind, "message": message }).to_string())
        .build()
}

#[http_component]
async fn handle(req: Request) -> anyhow::Result<impl IntoResponse> {
    if *req.method() != Method::Post {
        logging::warn(&format!("rejected method={:?}", req.method()));
        return Ok(json_error(405, "method_not_allowed", "send the code envelope as a POST body"));
    }

    let body_bytes = req.body().len();
    let envelope = match envelope::validate(req.body()) {
        Ok(e) => e,
        Err(EnvelopeError::Invalid(msg)) => {
            logging::warn(&format!("rejected invalid_envelope: {msg}"));
            return Ok(json_error(400, "invalid_envelope", &msg));
        }
        Err(EnvelopeError::CodeTooLarge) => {
            logging::warn(&format!("rejected code_too_large body_bytes={body_bytes}"));
            return Ok(json_error(413, "code_too_large", &format!("code exceeds {} bytes", envelope::MAX_CODE)));
        }
        Err(EnvelopeError::BodyTooLarge) => {
            logging::warn(&format!("rejected body_too_large body_bytes={body_bytes}"));
            return Ok(json_error(413, "body_too_large", &format!("request body exceeds {} bytes", envelope::MAX_BODY)));
        }
    };
    
    // We have to set the request context for the current sandbox before running the code.
    context::set_request_context(&envelope.sandbox_id);

    let run_input = envelope.input.as_ref().map(build_run_input);

    logging::info(&format!(
        "request sandbox={} code_bytes={} has_input={}",
        envelope.sandbox_id,
        envelope.code.len(),
        run_input.is_some()
    ));

    let started = std::time::Instant::now();
    let outcome = executor::run(&envelope.code, run_input.as_ref());
    let duration_ms = started.elapsed().as_millis();

    // guard-io captured whatever ts-sandbox's (real, unshimmed) console wrote
    // to wasi:cli/stdout`/`stderr` while `run` was executing — that's the
    // "main" shape's output, not anything ts-sandbox reports itself.
    let (stdout, stderr) = context::take_captured_output();

    let (kind, status, response) = match outcome {
        executor::Outcome::HandlerResponse(hr) => {
            let status = hr.status;
            let mut builder = Response::builder();
            builder.status(status);
            for (name, value) in &hr.headers {
                builder.header(name, value);
            }
            ("handler_response", status, builder.body(hr.body).build())
        }
        executor::Outcome::Main(error) => {
            if let Some(msg) = &error {
                logging::warn(&format!("sandbox={} uncaught error: {msg}", envelope.sandbox_id));
            }
            let body = serde_json::json!({ "stdout": stdout, "stderr": stderr, "error": error }).to_string();
            (
                "main",
                200,
                Response::builder().status(200).header("content-type", "application/json").body(body).build(),
            )
        }
        executor::Outcome::CompileError(msg) => {
            logging::warn(&format!("sandbox={} compile_error: {msg}", envelope.sandbox_id));
            ("compile_error", 400, json_error(400, "compile_error", &msg))
        }
        executor::Outcome::HandlerError(msg) => {
            logging::warn(&format!("sandbox={} handler_error: {msg}", envelope.sandbox_id));
            ("handler_error", 500, json_error(500, "handler_error", &msg))
        }
    };

    logging::info(&format!(
        "response sandbox={} outcome={kind} status={status} stdout_bytes={} stderr_bytes={} duration_ms={duration_ms}",
        envelope.sandbox_id,
        stdout.len(),
        stderr.len(),
    ));

    Ok(response)
}
