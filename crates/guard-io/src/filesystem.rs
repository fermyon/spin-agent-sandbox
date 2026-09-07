//! Exported `wasi:filesystem/types`/`preopens` — wired only because their
//! `descriptor` resource shares the same `wasi:io/streams` type as
//! `wasi:cli/stdout` (see `wit/world.wit`).
//! JS does not currentlt suport FS operations, so this is just a stub
//! TODO: Do we want to enable it in the future?

use crate::bindings::exports::wasi::filesystem::preopens as preopens_guarded;
use crate::bindings::exports::wasi::filesystem::types as guarded;

pub struct Descriptor;

impl guarded::GuestDescriptor for Descriptor {
    fn write_via_stream(&self, _offset: u64) -> Result<crate::bindings::exports::wasi::io::streams::OutputStream, guarded::ErrorCode> {
        unreachable!("no descriptor is ever created (get-directories returns none)")
    }

    fn append_via_stream(&self) -> Result<crate::bindings::exports::wasi::io::streams::OutputStream, guarded::ErrorCode> {
        unreachable!("no descriptor is ever created (get-directories returns none)")
    }

    fn get_flags(&self) -> Result<guarded::DescriptorFlags, guarded::ErrorCode> {
        unreachable!("no descriptor is ever created (get-directories returns none)")
    }

    fn get_type(&self) -> Result<guarded::DescriptorType, guarded::ErrorCode> {
        unreachable!("no descriptor is ever created (get-directories returns none)")
    }

    fn stat(&self) -> Result<guarded::DescriptorStat, guarded::ErrorCode> {
        unreachable!("no descriptor is ever created (get-directories returns none)")
    }
}

pub fn filesystem_error_code(_err: &crate::bindings::wasi::io::error::Error) -> Option<guarded::ErrorCode> {
    None
}

pub struct Preopens;

impl preopens_guarded::Guest for Preopens {
    fn get_directories() -> Vec<(preopens_guarded::Descriptor, String)> {
        Vec::new()
    }
}
