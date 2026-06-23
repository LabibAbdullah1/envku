use std::path::PathBuf;

pub fn get_server_dir_path() -> PathBuf {
    if let Ok(val) = std::env::var("ENVKU_SERVER_DIR") {
        PathBuf::from(val)
    } else {
        PathBuf::from("C:\\server")
    }
}

#[tauri::command]
pub fn get_server_dir() -> String {
    get_server_dir_path().to_string_lossy().to_string()
}
