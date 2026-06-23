use tauri::{AppHandle, Manager};

#[tauri::command]
pub fn select_directory() -> Result<Option<String>, String> {
    let result = rfd::FileDialog::new()
        .set_title("Pilih Folder Proyek")
        .pick_folder();
    
    Ok(result.map(|path| path.to_string_lossy().to_string()))
}

#[tauri::command]
pub fn open_in_browser(app: AppHandle, url: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_path(url, None::<String>)
        .map_err(|e| format!("Gagal membuka browser: {}", e))
}

#[tauri::command]
pub fn close_splashscreen(app: AppHandle) {
    if let Some(splashscreen) = app.get_webview_window("splashscreen") {
        let _ = splashscreen.close();
    }
    if let Some(main_window) = app.get_webview_window("main") {
        let _ = main_window.show();
        let _ = main_window.set_focus();
    }
}
