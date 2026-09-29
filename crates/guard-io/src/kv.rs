//! Scoped `fermyon:spin/key-value` export with collision-safe length-prefixed keys.

use crate::bindings::exports::fermyon::spin::key_value as guarded;
use spin_sdk::key_value::Store as RealStore;

/// `"{sandbox_id.len()}:{sandbox_id}:"` — namespaces every key so no sandboxId
/// can collide as a prefix of another.
pub fn scoped_prefix(sandbox_id: &str) -> String {
    format!("{}:{}:", sandbox_id.len(), sandbox_id)
}

pub struct PrefixingStore {
    real: RealStore,
    prefix: String,
}

fn map_err(e: spin_sdk::key_value::Error) -> guarded::Error {
    use spin_sdk::key_value::Error as RealError;
    match e {
        RealError::StoreTableFull => guarded::Error::StoreTableFull,
        RealError::NoSuchStore => guarded::Error::NoSuchStore,
        RealError::AccessDenied => guarded::Error::AccessDenied,
        RealError::Other(msg) => guarded::Error::Other(msg),
    }
}

impl guarded::GuestStore for PrefixingStore {
    fn open(label: String) -> Result<guarded::Store, guarded::Error> {
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

    // TODO: Do we want to even support get_keys? 
    // This could be expensive if 1000 sandboxes each write 1000 keys which would mean iterating over a million keys to filter out the ones for the current sandbox.
    fn get_keys(&self) -> Result<Vec<String>, guarded::Error> {
        let keys = self.real.get_keys().map_err(map_err)?;
        Ok(keys
            .into_iter()
            .filter_map(|k| k.strip_prefix(self.prefix.as_str()).map(str::to_string))
            .collect())
    }
}
