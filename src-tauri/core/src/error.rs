use thiserror::Error;

#[derive(Debug, Error)]
pub enum CoreError {
    #[error("not found")]
    NotFound,
    #[error("file missing: {0}")]
    FileMissing(String),
    #[error("move failed: {0}")]
    MoveFailed(String),
    #[error("invalid input: {0}")]
    InvalidInput(String),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Db(#[from] rusqlite::Error),
    #[error("image error: {0}")]
    Image(String),
}

impl CoreError {
    /// Stable machine-readable code, sent to the frontend as `AppError.code`.
    pub fn code(&self) -> &'static str {
        match self {
            CoreError::NotFound => "NotFound",
            CoreError::FileMissing(_) => "FileMissing",
            CoreError::MoveFailed(_) => "MoveFailed",
            CoreError::InvalidInput(_) => "InvalidInput",
            CoreError::Io(_) => "Io",
            CoreError::Db(_) => "Db",
            CoreError::Image(_) => "Image",
        }
    }
}

pub type Result<T> = std::result::Result<T, CoreError>;
