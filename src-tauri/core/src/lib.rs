//! snapnote-core: everything that does not need Tauri.

pub mod capture;
pub mod captured_at;
pub mod error;
pub mod files;
pub mod import;
pub mod ingest;
pub mod model;
pub mod reconcile;
pub mod save;
pub mod slug;
pub mod store;
pub mod thumbs;
pub mod watcher;

pub use error::{CoreError, Result};
pub use model::*;
