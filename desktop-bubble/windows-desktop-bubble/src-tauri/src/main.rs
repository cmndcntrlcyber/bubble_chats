// Prevents additional console window on Windows in release builds
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod api;
mod storage;

use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            api::send_message,
            api::send_message_ollama,
            api::fetch_ollama_models,
            api::tavily_search,
            storage::store_key,
            storage::get_key,
            storage::delete_key,
            screenshot,
        ])
        .setup(|app| {
            // Position window in bottom-right corner of primary monitor
            if let Some(window) = app.get_webview_window("bubble") {
                if let Some(monitor) = window.primary_monitor()? {
                    let screen = monitor.size();
                    let win_size = window.outer_size()?;
                    let x = (screen.width as i32) - (win_size.width as i32) - 24;
                    let y = (screen.height as i32) - (win_size.height as i32) - 48;
                    window.set_position(tauri::PhysicalPosition::new(x, y))?;
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Capture the primary screen and return a base64-encoded PNG string.
#[tauri::command]
async fn screenshot() -> Result<String, String> {
    use base64::Engine;
    use screenshots::Screen;

    let screens = Screen::all().map_err(|e| e.to_string())?;
    let screen = screens.into_iter().next().ok_or("no screen found")?;
    let image = screen.capture().map_err(|e| e.to_string())?;
    let png = image.to_png().map_err(|e| e.to_string())?;
    Ok(base64::engine::general_purpose::STANDARD.encode(&png))
}
