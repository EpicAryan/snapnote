//! snapnote-core: everything that does not need Tauri.

pub mod captured_at;
pub mod error;
pub mod model;
pub mod slug;

pub use error::{CoreError, Result};
pub use model::*;
