pub mod destinations;
pub mod screenshots;
pub mod settings;
pub mod system;
pub mod windows;

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct IdPayload {
    pub id: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct Empty {}

#[derive(Debug, Clone, Serialize)]
pub struct Progress {
    pub done: usize,
    pub total: usize,
}
