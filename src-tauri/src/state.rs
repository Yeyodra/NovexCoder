use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};

use sqlx::{sqlite::SqlitePoolOptions, SqlitePool};
use tokio::sync::oneshot;
use tokio_util::sync::CancellationToken;

use crate::error::{AppError, AppResult};

#[derive(Clone)]
pub struct PermissionState {
    pending: Arc<Mutex<HashMap<String, oneshot::Sender<bool>>>>,
}

impl Default for PermissionState {
    fn default() -> Self {
        Self::new()
    }
}

impl PermissionState {
    pub fn new() -> Self {
        Self {
            pending: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Register a permission request with a composite key (e.g. "session_id:tool_call_id").
    pub fn register(&self, key: String) -> oneshot::Receiver<bool> {
        let (tx, rx) = oneshot::channel();
        if let Ok(mut pending) = self.pending.lock() {
            pending.insert(key, tx);
        }
        rx
    }

    /// Respond to a permission request by its composite key.
    pub fn respond(&self, key: &str, allowed: bool) -> bool {
        self.pending
            .lock()
            .ok()
            .and_then(|mut pending| pending.remove(key))
            .map(|tx| tx.send(allowed).is_ok())
            .unwrap_or(false)
    }
}

/// Registry for cancellation tokens keyed by an arbitrary ID (session_id or agent_run_id).
#[derive(Clone, Default)]
pub struct CancellationRegistry {
    tokens: Arc<Mutex<HashMap<String, CancellationToken>>>,
}

impl CancellationRegistry {
    pub fn new() -> Self {
        Self {
            tokens: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Create and register a new cancellation token for the given key.
    /// Returns an error if the key already exists (prevents silent overwrite).
    pub fn register(&self, key: String) -> Result<CancellationToken, AppError> {
        let token = CancellationToken::new();
        let mut map = self.tokens.lock().map_err(|_| {
            AppError::Internal("Failed to acquire cancellation lock".to_string())
        })?;
        if map.contains_key(&key) {
            return Err(AppError::SessionBusy);
        }
        map.insert(key, token.clone());
        Ok(token)
    }

    /// Cancel the token associated with the given key (if any).
    pub fn cancel(&self, key: &str) {
        if let Ok(mut map) = self.tokens.lock() {
            if let Some(token) = map.remove(key) {
                token.cancel();
            }
        }
    }

    /// Remove the token for the given key without cancelling it (cleanup after normal completion).
    pub fn remove(&self, key: &str) {
        if let Ok(mut map) = self.tokens.lock() {
            map.remove(key);
        }
    }
}

/// Prevents concurrent runs on the same session.
#[derive(Clone, Default)]
pub struct SessionGuard {
    active: Arc<Mutex<HashSet<String>>>,
}

impl SessionGuard {
    pub fn acquire(&self, session_id: &str) -> Result<(), AppError> {
        let mut active = self.active.lock().map_err(|_| {
            AppError::Internal("Failed to acquire session guard lock".to_string())
        })?;
        if active.contains(session_id) {
            return Err(AppError::SessionBusy);
        }
        active.insert(session_id.to_string());
        Ok(())
    }

    pub fn release(&self, session_id: &str) {
        if let Ok(mut active) = self.active.lock() {
            active.remove(session_id);
        }
    }

    pub fn is_busy(&self, session_id: &str) -> bool {
        self.active
            .lock()
            .map(|active| active.contains(session_id))
            .unwrap_or(false)
    }
}

#[derive(Clone)]
pub struct AppState {
    pub db: Arc<SqlitePool>,
    pub permissions: PermissionState,
    pub cancellations: CancellationRegistry,
    pub session_guard: SessionGuard,
}

impl AppState {
    pub async fn new(database_url: &str) -> AppResult<Self> {
        let pool = SqlitePoolOptions::new()
            .max_connections(10)
            .connect(database_url)
            .await?;

        sqlx::query("PRAGMA foreign_keys = ON")
            .execute(&pool)
            .await?;

        Ok(Self {
            db: Arc::new(pool),
            permissions: PermissionState::new(),
            cancellations: CancellationRegistry::new(),
            session_guard: SessionGuard::default(),
        })
    }

    pub fn pool(&self) -> &SqlitePool {
        self.db.as_ref()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::AppError;

    #[test]
    fn test_permission_unique_key() {
        let perms = PermissionState::new();
        let _rx1 = perms.register("session1:tool_call_a".to_string());
        let _rx2 = perms.register("session1:tool_call_b".to_string());

        // Both coexist — responding to one doesn't affect the other
        assert!(perms.respond("session1:tool_call_a", true));
        assert!(perms.respond("session1:tool_call_b", false));
    }

    #[test]
    fn test_cancellation_no_overwrite() {
        let registry = CancellationRegistry::new();

        // First register succeeds
        let result = registry.register("agent:session1".to_string());
        assert!(result.is_ok());

        // Second register with same key returns Err
        let result2 = registry.register("agent:session1".to_string());
        assert!(result2.is_err());
        assert!(matches!(result2.unwrap_err(), AppError::SessionBusy));

        // After removal, register succeeds again
        registry.remove("agent:session1");
        let result3 = registry.register("agent:session1".to_string());
        assert!(result3.is_ok());
    }

    #[test]
    fn test_session_guard_acquire_release() {
        let guard = SessionGuard::default();

        // First acquire succeeds
        assert!(guard.acquire("session1").is_ok());
        assert!(guard.is_busy("session1"));

        // Second acquire on same session fails
        let err = guard.acquire("session1");
        assert!(err.is_err());
        assert!(matches!(err.unwrap_err(), AppError::SessionBusy));

        // Different session still works
        assert!(guard.acquire("session2").is_ok());

        // Release then acquire succeeds again
        guard.release("session1");
        assert!(!guard.is_busy("session1"));
        assert!(guard.acquire("session1").is_ok());
    }
}
