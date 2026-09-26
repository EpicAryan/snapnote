use serde::Serialize;
use snapnote_core::CoreError;

/// Wire shape for command failures: `{ code, message }`.
#[derive(Debug, Clone, Serialize)]
pub struct AppError {
    pub code: String,
    pub message: String,
}

impl AppError {
    pub fn new(code: &str, message: impl Into<String>) -> Self {
        AppError { code: code.to_string(), message: message.into() }
    }
}

impl From<CoreError> for AppError {
    fn from(e: CoreError) -> Self {
        AppError::new(e.code(), e.to_string())
    }
}
impl From<tauri::Error> for AppError {
    fn from(e: tauri::Error) -> Self {
        AppError::new("Tauri", e.to_string())
    }
}
impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        AppError::new("Io", e.to_string())
    }
}
impl<T> From<std::sync::PoisonError<T>> for AppError {
    fn from(_: std::sync::PoisonError<T>) -> Self {
        AppError::new("Lock", "internal state lock poisoned")
    }
}
impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.code, self.message)
    }
}
impl std::error::Error for AppError {}

pub type CmdResult<T> = Result<T, AppError>;

#[cfg(test)]
mod tests {
    use super::*;
    use snapnote_core::CoreError;

    #[test]
    fn core_errors_keep_their_code_and_serialize_flat() {
        let e: AppError = CoreError::InvalidInput("bad".into()).into();
        assert_eq!(serde_json::to_string(&e).unwrap(), r#"{"code":"InvalidInput","message":"invalid input: bad"}"#);
    }
}
