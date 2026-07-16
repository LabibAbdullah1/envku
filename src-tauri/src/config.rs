use std::path::PathBuf;

pub fn get_server_dir_path() -> PathBuf {
    crate::platform::env_path::get_server_dir_path()
}

#[tauri::command]
pub fn get_server_dir() -> String {
    get_server_dir_path().to_string_lossy().to_string()
}

