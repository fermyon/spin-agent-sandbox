//! Stubbed filesystem exports required by the shared WASI stream types.
//! Neither sandbox is allowed to perform filesystem I/O; no descriptors are instantiated.

use crate::bindings::exports::wasi::filesystem::preopens as preopens_guarded;
use crate::bindings::exports::wasi::filesystem::types as guarded;
use crate::bindings::exports::wasi::io::streams::{InputStream, OutputStream};

const UNREACHABLE: &str = "no descriptor is ever created (get-directories returns none)";

pub struct Descriptor;

impl guarded::GuestDescriptor for Descriptor {
    fn read_via_stream(&self, _offset: u64) -> Result<InputStream, guarded::ErrorCode> {
        unreachable!("{UNREACHABLE}")
    }

    fn write_via_stream(&self, _offset: u64) -> Result<OutputStream, guarded::ErrorCode> {
        unreachable!("{UNREACHABLE}")
    }

    fn append_via_stream(&self) -> Result<OutputStream, guarded::ErrorCode> {
        unreachable!("{UNREACHABLE}")
    }

    fn advise(&self, _offset: u64, _length: u64, _advice: guarded::Advice) -> Result<(), guarded::ErrorCode> {
        unreachable!("{UNREACHABLE}")
    }

    fn sync_data(&self) -> Result<(), guarded::ErrorCode> {
        unreachable!("{UNREACHABLE}")
    }

    fn get_flags(&self) -> Result<guarded::DescriptorFlags, guarded::ErrorCode> {
        unreachable!("{UNREACHABLE}")
    }

    fn get_type(&self) -> Result<guarded::DescriptorType, guarded::ErrorCode> {
        unreachable!("{UNREACHABLE}")
    }

    fn set_size(&self, _size: u64) -> Result<(), guarded::ErrorCode> {
        unreachable!("{UNREACHABLE}")
    }

    fn set_times(&self, _data_access_timestamp: guarded::NewTimestamp, _data_modification_timestamp: guarded::NewTimestamp) -> Result<(), guarded::ErrorCode> {
        unreachable!("{UNREACHABLE}")
    }

    fn read(&self, _length: u64, _offset: u64) -> Result<(Vec<u8>, bool), guarded::ErrorCode> {
        unreachable!("{UNREACHABLE}")
    }

    fn write(&self, _buffer: Vec<u8>, _offset: u64) -> Result<u64, guarded::ErrorCode> {
        unreachable!("{UNREACHABLE}")
    }

    fn read_directory(&self) -> Result<guarded::DirectoryEntryStream, guarded::ErrorCode> {
        unreachable!("{UNREACHABLE}")
    }

    fn sync(&self) -> Result<(), guarded::ErrorCode> {
        unreachable!("{UNREACHABLE}")
    }

    fn create_directory_at(&self, _path: String) -> Result<(), guarded::ErrorCode> {
        unreachable!("{UNREACHABLE}")
    }

    fn stat(&self) -> Result<guarded::DescriptorStat, guarded::ErrorCode> {
        unreachable!("{UNREACHABLE}")
    }

    fn stat_at(&self, _path_flags: guarded::PathFlags, _path: String) -> Result<guarded::DescriptorStat, guarded::ErrorCode> {
        unreachable!("{UNREACHABLE}")
    }

    fn set_times_at(
        &self,
        _path_flags: guarded::PathFlags,
        _path: String,
        _data_access_timestamp: guarded::NewTimestamp,
        _data_modification_timestamp: guarded::NewTimestamp,
    ) -> Result<(), guarded::ErrorCode> {
        unreachable!("{UNREACHABLE}")
    }

    fn link_at(&self, _old_path_flags: guarded::PathFlags, _old_path: String, _new_descriptor: guarded::DescriptorBorrow<'_>, _new_path: String) -> Result<(), guarded::ErrorCode> {
        unreachable!("{UNREACHABLE}")
    }

    fn open_at(
        &self,
        _path_flags: guarded::PathFlags,
        _path: String,
        _open_flags: guarded::OpenFlags,
        _flags: guarded::DescriptorFlags,
    ) -> Result<guarded::Descriptor, guarded::ErrorCode> {
        unreachable!("{UNREACHABLE}")
    }

    fn readlink_at(&self, _path: String) -> Result<String, guarded::ErrorCode> {
        unreachable!("{UNREACHABLE}")
    }

    fn remove_directory_at(&self, _path: String) -> Result<(), guarded::ErrorCode> {
        unreachable!("{UNREACHABLE}")
    }

    fn rename_at(&self, _old_path: String, _new_descriptor: guarded::DescriptorBorrow<'_>, _new_path: String) -> Result<(), guarded::ErrorCode> {
        unreachable!("{UNREACHABLE}")
    }

    fn symlink_at(&self, _old_path: String, _new_path: String) -> Result<(), guarded::ErrorCode> {
        unreachable!("{UNREACHABLE}")
    }

    fn unlink_file_at(&self, _path: String) -> Result<(), guarded::ErrorCode> {
        unreachable!("{UNREACHABLE}")
    }

    fn is_same_object(&self, _other: guarded::DescriptorBorrow<'_>) -> bool {
        unreachable!("{UNREACHABLE}")
    }

    fn metadata_hash(&self) -> Result<guarded::MetadataHashValue, guarded::ErrorCode> {
        unreachable!("{UNREACHABLE}")
    }

    fn metadata_hash_at(&self, _path_flags: guarded::PathFlags, _path: String) -> Result<guarded::MetadataHashValue, guarded::ErrorCode> {
        unreachable!("{UNREACHABLE}")
    }
}

pub struct DirectoryEntryStream;

impl guarded::GuestDirectoryEntryStream for DirectoryEntryStream {
    fn read_directory_entry(&self) -> Result<Option<guarded::DirectoryEntry>, guarded::ErrorCode> {
        unreachable!("no directory-entry-stream is ever created (read-directory is unreachable)")
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
