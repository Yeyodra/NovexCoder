use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

use crate::error::AppResult;

#[tauri::command]
pub async fn export_session_markdown(
    app: AppHandle,
    default_file_name: String,
    content: String,
) -> AppResult<Option<String>> {
    let path = app
        .dialog()
        .file()
        .set_title("Export Session as Markdown")
        .set_file_name(&default_file_name)
        .add_filter("Markdown", &["md"])
        .blocking_save_file();

    match path {
        Some(file_path) => {
            let path_str = file_path.to_string();
            std::fs::write(&path_str, content)?;
            Ok(Some(path_str))
        }
        None => Ok(None),
    }
}

#[tauri::command]
pub async fn reveal_in_explorer(app: AppHandle, path: String) -> AppResult<()> {
    app.opener().reveal_item_in_dir(&path)?;
    Ok(())
}
