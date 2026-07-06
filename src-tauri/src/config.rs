use std::path::PathBuf;
use winreg::enums::*;
use winreg::RegKey;

pub fn get_server_dir_path() -> PathBuf {
    if let Ok(val) = std::env::var("ENVKU_SERVER_DIR") {
        return PathBuf::from(val);
    }

    // Cek registry di HKCU terlebih dahulu
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    if let Ok(key) = hkcu.open_subkey("Software\\envku\\Envku") {
        if let Ok(val) = key.get_value::<String, _>("ServerDir") {
            if !val.is_empty() {
                return PathBuf::from(val);
            }
        }
    }

    // Cek registry di HKLM jika HKCU tidak ada
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    if let Ok(key) = hklm.open_subkey("Software\\envku\\Envku") {
        if let Ok(val) = key.get_value::<String, _>("ServerDir") {
            if !val.is_empty() {
                return PathBuf::from(val);
            }
        }
    }

    PathBuf::from("C:\\server")
}

#[tauri::command]
pub fn get_server_dir() -> String {
    get_server_dir_path().to_string_lossy().to_string()
}
