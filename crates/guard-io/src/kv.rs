//! Scoped `fermyon:spin/key-value` export with collision-safe length-prefixed keys.

use crate::bindings::exports::fermyon::spin::key_value as guarded;
use crate::bindings::fermyon::spin::key_value as real;
use real::Store as RealStore;

/// `"{sandbox_id.len()}:{sandbox_id}:"` — namespaces every key so no sandboxId
/// can collide as a prefix of another.
pub fn scoped_prefix(sandbox_id: &str) -> String {
    format!("{}:{}:", sandbox_id.len(), sandbox_id)
}

pub struct PrefixingStore {
    real: RealStore,
    prefix: String,
}

fn map_err(e: real::Error) -> guarded::Error {
    match e {
        real::Error::StoreTableFull => guarded::Error::StoreTableFull,
        real::Error::NoSuchStore => guarded::Error::NoSuchStore,
        real::Error::AccessDenied => guarded::Error::AccessDenied,
        real::Error::Other(msg) => guarded::Error::Other(msg),
    }
}

impl guarded::GuestStore for PrefixingStore {
    fn open(label: String) -> Result<guarded::Store, guarded::Error> {
        if !crate::request_context::kv_enabled() {
            return Err(guarded::Error::AccessDenied);
        }
        let sandbox_id = crate::request_context::sandbox_id();
        let real = RealStore::open(&label).map_err(map_err)?;
        Ok(guarded::Store::new(PrefixingStore {
            real,
            prefix: scoped_prefix(&sandbox_id),
        }))
    }

    fn get(&self, key: String) -> Result<Option<Vec<u8>>, guarded::Error> {
        self.real.get(format!("{}{key}", self.prefix).as_str()).map_err(map_err)
    }

    fn set(&self, key: String, value: Vec<u8>) -> Result<(), guarded::Error> {
        self.real
            .set(format!("{}{key}", self.prefix).as_str(), &value)
            .map_err(map_err)
    }

    fn delete(&self, key: String) -> Result<(), guarded::Error> {
        self.real
            .delete(format!("{}{key}", self.prefix).as_str())
            .map_err(map_err)
    }

    fn exists(&self, key: String) -> Result<bool, guarded::Error> {
        self.real
            .exists(format!("{}{key}", self.prefix).as_str())
            .map_err(map_err)
    }

    // TODO: Decide whether to retain get_keys; it scans the shared store.
    fn get_keys(&self) -> Result<Vec<String>, guarded::Error> {
        let keys = self.real.get_keys().map_err(map_err)?;
        Ok(keys
            .into_iter()
            .filter_map(|k| k.strip_prefix(self.prefix.as_str()).map(str::to_string))
            .collect())
    }
}
