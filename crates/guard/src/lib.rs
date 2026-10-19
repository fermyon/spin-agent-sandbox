//! Spin's HTTP entry point: validates the envelope, scopes guard-io, and invokes the guest.

wit_bindgen::generate!({
    path: "../../wit/guard",
    world: "guard-front",
    generate_all,
});

mod envelope;
mod logging;

use envelope::{EnvelopeError, RawInput};
use futures::{SinkExt, TryStreamExt};
use sandbox::guard::{context, executor};
use spin_sdk::http::{
    Fields, IncomingRequest, Method, OutgoingResponse, Response, ResponseOutparam,
};
use spin_sdk::http_component;

enum BodyReadError {
    TooLarge,
    Read,
}

async fn read_body(req: IncomingRequest) -> Result<Vec<u8>, BodyReadError> {
    let mut stream = req.into_body_stream();
    let mut body = Vec::new();
    while let Some(chunk) = stream.try_next().await.map_err(|_| BodyReadError::Read)? {
        if chunk.len() > envelope::MAX_BODY.saturating_sub(body.len()) {
            return Err(BodyReadError::TooLarge);
        }
        body.extend_from_slice(&chunk);
    }
    Ok(body)
}

fn build_run_input(input: &RawInput) -> executor::RunInput {
    executor::RunInput {
        method: input.method.clone().unwrap_or_else(|| "GET".to_string()),
        path: input.path.clone().unwrap_or_else(|| "/".to_string()),
        headers: input
            .headers
            .clone()
            .unwrap_or_default()
            .into_iter()
            .collect(),
        query: input
            .query
            .clone()
            .unwrap_or_default()
            .into_iter()
            .collect(),
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

/// Sends a fully-buffered `Response` through `response_out`. Used for every
/// outcome except `handler-response`, which streams instead (see `handle`).
async fn respond(response_out: ResponseOutparam, mut response: Response) {
    let body = std::mem::take(response.body_mut());
    match OutgoingResponse::try_from(response) {
        Ok(outgoing) => {
            if let Err(e) = response_out.set_with_body(outgoing, body).await {
                logging::error(&format!("failed to send response: {e:?}"));
            }
        }
        Err(e) => {
            logging::error(&format!("failed to build response: {e:?}"));
            let outgoing = OutgoingResponse::new(Fields::new());
            let _ = outgoing.set_status_code(500);
            let _ = response_out.set_with_body(outgoing, Vec::new()).await;
        }
    }
}

fn log_response(
    sandbox_id: &str,
    kind: &str,
    status: u16,
    stdout: &str,
    stderr: &str,
    duration_ms: u128,
) {
    logging::info(&format!(
        "response sandbox={sandbox_id} outcome={kind} status={status} stdout_bytes={} stderr_bytes={} duration_ms={duration_ms}",
        stdout.len(),
        stderr.len(),
    ));
}

#[http_component]
async fn handle(req: IncomingRequest, response_out: ResponseOutparam) {
    if req.method() != Method::Post {
        logging::warn(&format!("rejected method={:?}", req.method()));
        respond(
            response_out,
            json_error(
                405,
                "method_not_allowed",
                "send the code envelope as a POST body",
            ),
        )
        .await;
        return;
    }

    let body = match read_body(req).await {
        Ok(body) => body,
        Err(BodyReadError::Read) => {
            logging::warn("failed to read request body");
            respond(
                response_out,
                json_error(400, "invalid_request", "failed to read request body"),
            )
            .await;
            return;
        }
        Err(BodyReadError::TooLarge) => {
            logging::warn("rejected body_too_large");
            respond(
                response_out,
                json_error(
                    413,
                    "body_too_large",
                    &format!("request body exceeds {} bytes", envelope::MAX_BODY),
                ),
            )
            .await;
            return;
        }
    };

    let body_bytes = body.len();
    let envelope = match envelope::validate(&body) {
        Ok(e) => e,
        Err(EnvelopeError::Invalid(msg)) => {
            logging::warn(&format!("rejected invalid_envelope: {msg}"));
            respond(response_out, json_error(400, "invalid_envelope", &msg)).await;
            return;
        }
        Err(EnvelopeError::CodeTooLarge) => {
            logging::warn(&format!("rejected code_too_large body_bytes={body_bytes}"));
            respond(
                response_out,
                json_error(
                    413,
                    "code_too_large",
                    &format!("code exceeds {} bytes", envelope::MAX_CODE),
                ),
            )
            .await;
            return;
        }
        Err(EnvelopeError::BodyTooLarge) => {
            logging::warn(&format!("rejected body_too_large body_bytes={body_bytes}"));
            respond(
                response_out,
                json_error(
                    413,
                    "body_too_large",
                    &format!("request body exceeds {} bytes", envelope::MAX_BODY),
                ),
            )
            .await;
            return;
        }
    };

    // We have to set the request context for the current sandbox before running the code.
    context::set_request_context(
        &envelope.sandbox_id,
        envelope.allowed_hosts.as_deref(),
        envelope.kv_enabled,
    );

    let run_input = envelope.input.as_ref().map(build_run_input);

    logging::info(&format!(
        "request sandbox={} code_bytes={} has_input={}",
        envelope.sandbox_id,
        envelope.code.len(),
        run_input.is_some()
    ));

    let started = std::time::Instant::now();
    let outcome = executor::run(&envelope.code, run_input.as_ref());

    match outcome {
        executor::Outcome::HandlerResponse(hr) => {
            let status = hr.status;
            let header_list: Vec<(String, Vec<u8>)> = hr
                .headers
                .iter()
                .map(|(k, v)| (k.clone(), v.clone().into_bytes()))
                .collect();
            let fields = match Fields::from_list(&header_list) {
                Ok(f) => f,
                Err(e) => {
                    logging::warn(&format!(
                        "sandbox={} handler produced invalid headers: {e:?}",
                        envelope.sandbox_id
                    ));
                    respond(
                        response_out,
                        json_error(500, "handler_error", "handler produced invalid headers"),
                    )
                    .await;
                    return;
                }
            };
            let outgoing = OutgoingResponse::new(fields);
            if outgoing.set_status_code(status).is_err() {
                logging::warn(&format!(
                    "sandbox={} handler produced invalid status code {status}",
                    envelope.sandbox_id
                ));
                respond(
                    response_out,
                    json_error(
                        500,
                        "handler_error",
                        "handler produced an invalid status code",
                    ),
                )
                .await;
                return;
            }

            // `take_body` borrows, so it must run before `response_out.set`
            // consumes `outgoing` by value.
            let mut body_sink = outgoing.take_body();
            response_out.set(outgoing);

            loop {
                match hr.body.read() {
                    executor::BodyChunk::Chunk(chunk) => {
                        if let Err(e) = body_sink.send(chunk).await {
                            logging::warn(&format!(
                                "sandbox={} response stream write failed: {e:?}",
                                envelope.sandbox_id
                            ));
                            break;
                        }
                    }
                    executor::BodyChunk::Done => break,
                    executor::BodyChunk::Error(msg) => {
                        // Status/headers are already committed at this point,
                        // so an error here can only truncate the body, not
                        // change the response's status.
                        logging::warn(&format!(
                            "sandbox={} response body stream error: {msg}",
                            envelope.sandbox_id
                        ));
                        break;
                    }
                }
            }
            let _ = body_sink.flush().await;
            let _ = body_sink.close().await;
            drop(body_sink);

            // Captured only now, not right after `run()` returns: a lazily
            // streamed body can still call `console.log` while chunks are
            // being pulled above, after `run()` has already returned.
            let (stdout, stderr) = context::take_captured_output();
            log_response(
                &envelope.sandbox_id,
                "handler_response",
                status,
                &stdout,
                &stderr,
                started.elapsed().as_millis(),
            );
        }
        executor::Outcome::Main(error) => {
            if let Some(msg) = &error {
                logging::warn(&format!(
                    "sandbox={} uncaught error: {msg}",
                    envelope.sandbox_id
                ));
            }
            let (stdout, stderr) = context::take_captured_output();
            log_response(
                &envelope.sandbox_id,
                "main",
                200,
                &stdout,
                &stderr,
                started.elapsed().as_millis(),
            );
            let body = serde_json::json!({ "stdout": stdout, "stderr": stderr, "error": error })
                .to_string();
            respond(
                response_out,
                Response::builder()
                    .status(200)
                    .header("content-type", "application/json")
                    .body(body)
                    .build(),
            )
            .await;
        }
        executor::Outcome::CompileError(msg) => {
            logging::warn(&format!(
                "sandbox={} compile_error: {msg}",
                envelope.sandbox_id
            ));
            let (stdout, stderr) = context::take_captured_output();
            log_response(
                &envelope.sandbox_id,
                "compile_error",
                400,
                &stdout,
                &stderr,
                started.elapsed().as_millis(),
            );
            respond(response_out, json_error(400, "compile_error", &msg)).await;
        }
        executor::Outcome::HandlerError(msg) => {
            logging::warn(&format!(
                "sandbox={} handler_error: {msg}",
                envelope.sandbox_id
            ));
            let (stdout, stderr) = context::take_captured_output();
            log_response(
                &envelope.sandbox_id,
                "handler_error",
                500,
                &stdout,
                &stderr,
                started.elapsed().as_millis(),
            );
            respond(response_out, json_error(500, "handler_error", &msg)).await;
        }
    }
}
