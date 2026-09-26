pub mod destinations;
pub mod screenshots;
pub mod settings;
pub mod system;

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct IdPayload {
    pub id: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct Empty {}
