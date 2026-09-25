//! snapnote-core: everything that does not need Tauri.

pub mod error;
pub mod model;

pub use error::{CoreError, Result};
pub use model::*;
