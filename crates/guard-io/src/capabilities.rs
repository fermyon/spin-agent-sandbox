//! Denied Spin and WASI capabilities: everything the Python guest imports via spin_sdk
//! except scoped KV. Every `open`/`get`/`infer` returns the interface's closest error
//! (`access-denied` where it exists, else a message), so user code gets an ordinary
//! exception instead of trapping the instance.
//!
//! Resource methods are `unreachable!`: no entry point ever hands out a resource, so no
//! handle exists to call them on (the same reasoning as src/filesystem.rs).

use crate::bindings::exports::fermyon::spin::{llm, mqtt, mysql, postgres, redis, sqlite, variables};
use crate::bindings::exports::spin::postgres3_0_0::postgres as postgres3;
use crate::bindings::exports::spin::postgres4_0_0::postgres as postgres4;
use crate::bindings::exports::spin::sqlite::sqlite as sqlite3;
use crate::bindings::exports::wasi::config::store as config;
use crate::bindings::exports::wasi::keyvalue::{atomics, batch, store as wasi_kv};
use crate::Component;

pub(crate) const NO_HANDLE: &str = "no resource of this type is ever created (its constructor is denied)";

fn denied(capability: &str) -> String {
    format!("{capability} is not available in this sandbox")
}

/// Every resource below is a connection or bucket whose `open` is denied.
pub struct Never;

impl llm::Guest for Component {
    fn infer(
        _model: llm::InferencingModel,
        _prompt: String,
        _params: Option<llm::InferencingParams>,
    ) -> Result<llm::InferencingResult, llm::Error> {
        Err(llm::Error::RuntimeError(denied("llm")))
    }

    fn generate_embeddings(
        _model: llm::EmbeddingModel,
        _text: Vec<String>,
    ) -> Result<llm::EmbeddingsResult, llm::Error> {
        Err(llm::Error::RuntimeError(denied("llm")))
    }
}

impl variables::Guest for Component {
    fn get(_name: String) -> Result<String, variables::Error> {
        Err(variables::Error::Provider(denied("variables")))
    }
}

impl config::Guest for Component {
    fn get(_key: String) -> Result<Option<String>, config::Error> {
        Err(config::Error::Upstream(denied("wasi:config")))
    }

    fn get_all() -> Result<Vec<(String, String)>, config::Error> {
        Err(config::Error::Upstream(denied("wasi:config")))
    }
}

impl redis::Guest for Component {
    type Connection = Never;
}

impl redis::GuestConnection for Never {
    fn open(_address: String) -> Result<redis::Connection, redis::Error> {
        Err(redis::Error::Other(denied("redis")))
    }
    fn publish(&self, _channel: String, _payload: redis::Payload) -> Result<(), redis::Error> {
        unreachable!("{NO_HANDLE}")
    }
    fn get(&self, _key: String) -> Result<Option<redis::Payload>, redis::Error> {
        unreachable!("{NO_HANDLE}")
    }
    fn set(&self, _key: String, _value: redis::Payload) -> Result<(), redis::Error> {
        unreachable!("{NO_HANDLE}")
    }
    fn incr(&self, _key: String) -> Result<i64, redis::Error> {
        unreachable!("{NO_HANDLE}")
    }
    fn del(&self, _keys: Vec<String>) -> Result<u32, redis::Error> {
        unreachable!("{NO_HANDLE}")
    }
    fn sadd(&self, _key: String, _values: Vec<String>) -> Result<u32, redis::Error> {
        unreachable!("{NO_HANDLE}")
    }
    fn smembers(&self, _key: String) -> Result<Vec<String>, redis::Error> {
        unreachable!("{NO_HANDLE}")
    }
    fn srem(&self, _key: String, _values: Vec<String>) -> Result<u32, redis::Error> {
        unreachable!("{NO_HANDLE}")
    }
    fn execute(
        &self,
        _command: String,
        _arguments: Vec<redis::RedisParameter>,
    ) -> Result<Vec<redis::RedisResult>, redis::Error> {
        unreachable!("{NO_HANDLE}")
    }
}

impl mqtt::Guest for Component {
    type Connection = Never;
}

impl mqtt::GuestConnection for Never {
    fn open(
        _address: String,
        _username: String,
        _password: String,
        _keep_alive_interval_in_secs: u64,
    ) -> Result<mqtt::Connection, mqtt::Error> {
        Err(mqtt::Error::Other(denied("mqtt")))
    }
    fn publish(&self, _topic: String, _payload: mqtt::Payload, _qos: mqtt::Qos) -> Result<(), mqtt::Error> {
        unreachable!("{NO_HANDLE}")
    }
}

impl postgres::Guest for Component {
    type Connection = Never;
}

impl postgres::GuestConnection for Never {
    fn open(_address: String) -> Result<postgres::Connection, postgres::Error> {
        Err(postgres::Error::Other(denied("postgres")))
    }
    fn query(&self, _statement: String, _params: Vec<postgres::ParameterValue>) -> Result<postgres::RowSet, postgres::Error> {
        unreachable!("{NO_HANDLE}")
    }
    fn execute(&self, _statement: String, _params: Vec<postgres::ParameterValue>) -> Result<u64, postgres::Error> {
        unreachable!("{NO_HANDLE}")
    }
}

impl mysql::Guest for Component {
    type Connection = Never;
}

impl mysql::GuestConnection for Never {
    fn open(_address: String) -> Result<mysql::Connection, mysql::Error> {
        Err(mysql::Error::Other(denied("mysql")))
    }
    fn query(&self, _statement: String, _params: Vec<mysql::ParameterValue>) -> Result<mysql::RowSet, mysql::Error> {
        unreachable!("{NO_HANDLE}")
    }
    fn execute(&self, _statement: String, _params: Vec<mysql::ParameterValue>) -> Result<(), mysql::Error> {
        unreachable!("{NO_HANDLE}")
    }
}

impl postgres3::Guest for Component {
    type Connection = Never;
}

impl postgres3::GuestConnection for Never {
    fn open(_address: String) -> Result<postgres3::Connection, postgres3::Error> {
        Err(postgres3::Error::Other(denied("postgres")))
    }
    fn query(
        &self,
        _statement: String,
        _params: Vec<postgres3::ParameterValue>,
    ) -> Result<postgres3::RowSet, postgres3::Error> {
        unreachable!("{NO_HANDLE}")
    }
    fn execute(&self, _statement: String, _params: Vec<postgres3::ParameterValue>) -> Result<u64, postgres3::Error> {
        unreachable!("{NO_HANDLE}")
    }
}

impl postgres4::Guest for Component {
    type Connection = Never;
}

impl postgres4::GuestConnection for Never {
    fn open(_address: String) -> Result<postgres4::Connection, postgres4::Error> {
        Err(postgres4::Error::Other(denied("postgres")))
    }
    fn query(
        &self,
        _statement: String,
        _params: Vec<postgres4::ParameterValue>,
    ) -> Result<postgres4::RowSet, postgres4::Error> {
        unreachable!("{NO_HANDLE}")
    }
    fn execute(&self, _statement: String, _params: Vec<postgres4::ParameterValue>) -> Result<u64, postgres4::Error> {
        unreachable!("{NO_HANDLE}")
    }
}

impl sqlite::Guest for Component {
    type Connection = Never;
}

impl sqlite::GuestConnection for Never {
    fn open(_database: String) -> Result<sqlite::Connection, sqlite::Error> {
        Err(sqlite::Error::AccessDenied)
    }
    fn execute(&self, _statement: String, _parameters: Vec<sqlite::Value>) -> Result<sqlite::QueryResult, sqlite::Error> {
        unreachable!("{NO_HANDLE}")
    }
}

impl sqlite3::Guest for Component {
    type Connection = Never;
}

impl sqlite3::GuestConnection for Never {
    fn open(_database: String) -> Result<sqlite3::Connection, sqlite3::Error> {
        Err(sqlite3::Error::AccessDenied)
    }
    fn execute(
        &self,
        _statement: String,
        _parameters: Vec<sqlite3::Value>,
    ) -> Result<sqlite3::QueryResult, sqlite3::Error> {
        unreachable!("{NO_HANDLE}")
    }
    fn last_insert_rowid(&self) -> i64 {
        unreachable!("{NO_HANDLE}")
    }
    fn changes(&self) -> u64 {
        unreachable!("{NO_HANDLE}")
    }
}

impl wasi_kv::Guest for Component {
    type Bucket = Never;

    fn open(_identifier: String) -> Result<wasi_kv::Bucket, wasi_kv::Error> {
        Err(wasi_kv::Error::AccessDenied)
    }
}

impl wasi_kv::GuestBucket for Never {
    fn get(&self, _key: String) -> Result<Option<Vec<u8>>, wasi_kv::Error> {
        unreachable!("{NO_HANDLE}")
    }
    fn set(&self, _key: String, _value: Vec<u8>) -> Result<(), wasi_kv::Error> {
        unreachable!("{NO_HANDLE}")
    }
    fn delete(&self, _key: String) -> Result<(), wasi_kv::Error> {
        unreachable!("{NO_HANDLE}")
    }
    fn exists(&self, _key: String) -> Result<bool, wasi_kv::Error> {
        unreachable!("{NO_HANDLE}")
    }
    fn list_keys(&self, _cursor: Option<String>) -> Result<wasi_kv::KeyResponse, wasi_kv::Error> {
        unreachable!("{NO_HANDLE}")
    }
}

// The atomics and batch functions all take a `borrow<bucket>`, and `wasi_kv::open` never
// returns one, so the canonical ABI rejects any call before it reaches these bodies.
impl atomics::Guest for Component {
    type Cas = Never;

    fn increment(_bucket: atomics::BucketBorrow<'_>, _key: String, _delta: i64) -> Result<i64, atomics::Error> {
        unreachable!("{NO_HANDLE}")
    }
    fn swap(_cas: atomics::Cas, _value: Vec<u8>) -> Result<(), atomics::CasError> {
        unreachable!("{NO_HANDLE}")
    }
}

impl atomics::GuestCas for Never {
    fn new(_bucket: atomics::BucketBorrow<'_>, _key: String) -> Result<atomics::Cas, atomics::Error> {
        unreachable!("{NO_HANDLE}")
    }
    fn current(&self) -> Result<Option<Vec<u8>>, atomics::Error> {
        unreachable!("{NO_HANDLE}")
    }
}

impl batch::Guest for Component {
    fn get_many(
        _bucket: batch::BucketBorrow<'_>,
        _keys: Vec<String>,
    ) -> Result<Vec<(String, Option<Vec<u8>>)>, batch::Error> {
        unreachable!("{NO_HANDLE}")
    }
    fn set_many(_bucket: batch::BucketBorrow<'_>, _key_values: Vec<(String, Vec<u8>)>) -> Result<(), batch::Error> {
        unreachable!("{NO_HANDLE}")
    }
    fn delete_many(_bucket: batch::BucketBorrow<'_>, _keys: Vec<String>) -> Result<(), batch::Error> {
        unreachable!("{NO_HANDLE}")
    }
}
