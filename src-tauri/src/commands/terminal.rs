use tauri::{AppHandle, State};

use crate::services::terminal_service::TerminalService;

#[tauri::command]
pub async fn create_terminal(
    app_handle: AppHandle,
    terminal_service: State<'_, TerminalService>,
    cwd: Option<String>,
    cols: u16,
    rows: u16,
) -> Result<String, String> {
    terminal_service
        .create_session(app_handle, cwd, cols, rows)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn write_terminal(
    terminal_service: State<'_, TerminalService>,
    session_id: String,
    data: Vec<u8>,
) -> Result<(), String> {
    terminal_service
        .write_session(&session_id, &data)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn resize_terminal(
    terminal_service: State<'_, TerminalService>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    terminal_service
        .resize_session(&session_id, cols, rows)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn kill_terminal(
    terminal_service: State<'_, TerminalService>,
    session_id: String,
) -> Result<(), String> {
    terminal_service
        .kill_session(&session_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn open_terminal(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/c", "start", "powershell", "-NoExit", "-WorkingDirectory", &path])
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .args(["-a", "Terminal", &path])
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "linux")]
    {
        let terminals = ["x-terminal-emulator", "gnome-terminal", "konsole", "xterm"];
        let mut opened = false;
        for term in terminals {
            if std::process::Command::new(term)
                .arg("--working-directory")
                .arg(&path)
                .spawn()
                .is_ok()
            {
                opened = true;
                break;
            }
        }
        if !opened {
            return Err("No terminal emulator found".to_string());
        }
    }

    Ok(())
}
