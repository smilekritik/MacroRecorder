//! Dispatch receipt capturing execution timestamps and diagnostics for injected actions.

/// Receipt returned after an input injection operation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DispatchReceipt {
    /// Action or event identifier.
    pub id: String,
    /// Scheduled execution timestamp in microseconds.
    pub scheduled_microseconds: i64,
    /// Actual start timestamp of the injection in microseconds.
    pub started_microseconds: i64,
    /// Completion timestamp of the injection in microseconds.
    pub completed_microseconds: i64,
    /// Optional hook confirmation timestamp in microseconds (None for targeted delivery).
    pub confirmed_microseconds: Option<i64>,
    /// Whether the injection succeeded without OS or driver error.
    pub success: bool,
    /// Error message if injection failed.
    pub error: Option<String>,
}

impl DispatchReceipt {
    /// Constructs a successful receipt.
    pub fn success(
        id: impl Into<String>,
        scheduled_us: i64,
        started_us: i64,
        completed_us: i64,
        confirmed_us: Option<i64>,
    ) -> Self {
        Self {
            id: id.into(),
            scheduled_microseconds: scheduled_us,
            started_microseconds: started_us,
            completed_microseconds: completed_us,
            confirmed_microseconds: confirmed_us,
            success: true,
            error: None,
        }
    }

    /// Constructs a failed receipt.
    pub fn failure(
        id: impl Into<String>,
        scheduled_us: i64,
        started_us: i64,
        completed_us: i64,
        error: impl Into<String>,
    ) -> Self {
        Self {
            id: id.into(),
            scheduled_microseconds: scheduled_us,
            started_microseconds: started_us,
            completed_microseconds: completed_us,
            confirmed_microseconds: None,
            success: false,
            error: Some(error.into()),
        }
    }
}
