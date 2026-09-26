//! snapnote-core: everything that does not need Tauri.

pub mod captured_at;
pub mod error;
pub mod files;
pub mod ingest;
pub mod model;
pub mod save;
pub mod slug;
pub mod store;

pub use error::{CoreError, Result};
pub use model::*;
