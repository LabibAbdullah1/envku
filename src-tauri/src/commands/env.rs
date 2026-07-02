use std::fs;
use std::path::Path;
use std::collections::HashMap;
use winreg::enums::{HKEY_LOCAL_MACHINE, KEY_ALL_ACCESS, KEY_READ};
use winreg::RegKey;
use crate::config::get_server_dir_path;

pub fn register_system_paths() -> Result<(), String> {
    let server_dir = get_server_dir_path();
    
    // We want to add these paths to User PATH if they exist:
    // - C:\server\composer
    // - C:\server\mysql\bin
    // - C:\server\redis
    let composer_path = server_dir.join("composer");
    let mysql_bin_path = server_dir.join("mysql").join("bin");
    let redis_path = server_dir.join("redis");
    
    let mut paths_to_add = Vec::new();
    if composer_path.exists() {
        paths_to_add.push(composer_path.to_string_lossy().to_string());
    }
    if mysql_bin_path.exists() {
        paths_to_add.push(mysql_bin_path.to_string_lossy().to_string());
    }
    if redis_path.exists() {
        paths_to_add.push(redis_path.to_string_lossy().to_string());
    }
    
    if paths_to_add.is_empty() {
        return Ok(());
    }

    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let env_key = hklm.open_subkey_with_flags(
        "System\\CurrentControlSet\\Control\\Session Manager\\Environment",
        KEY_READ | KEY_ALL_ACCESS
    ).map_err(|e| format!("Gagal membuka registry PATH System: {}. Pastikan dijalankan sebagai Administrator.", e))?;

    let path_val: String = env_key.get_value("Path")
        .unwrap_or_else(|_| "".to_string());

    let existing_paths: Vec<String> = path_val.split(';').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect();
    let mut updated_paths = existing_paths.clone();
    let mut changed = false;

    for path in paths_to_add {
        let path_lower = path.to_lowercase();
        // Check if path already exists in registry (case-insensitive check)
        let already_exists = existing_paths.iter().any(|p| p.to_lowercase() == path_lower);
        if !already_exists {
            updated_paths.push(path);
            changed = true;
        }
    }

    if changed {
        let new_path_val = updated_paths.join(";");
        env_key.set_value("Path", &new_path_val)
            .map_err(|e| format!("Gagal menulis PATH baru ke registry System: {}", e))?;

        // Refresh Windows environment (broadcast setting change so explorer picks it up)
        let _ = crate::create_hidden_command("powershell.exe")
            .args(&[
                "-Command",
                "$signature = @'\n[DllImport(\"user32.dll\", SetLastError = true, CharSet = CharSet.Auto)]\npublic static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint Msg, IntPtr wParam, string lParam, uint fuFlags, uint uTimeout, out IntPtr lpdwResult);\n'@\n$type = Add-Type -MemberDefinition $signature -Name \"Win32\" -Namespace \"Env\" -PassThru\n$type::SendMessageTimeout(0xffff, 0x001A, 0, \"Environment\", 2, 2000, [ref][IntPtr]::Zero) | Out-Null"
            ])
            .output();
    }

    Ok(())
}

#[tauri::command]
pub fn check_and_init_environment() -> Result<String, String> {
    let base_path = get_server_dir_path();
    let www_path = base_path.join("www");

    let res = if base_path.exists() {
        Ok("exists".to_string())
    } else {
        match fs::create_dir_all(&www_path) {
            Ok(_) => Ok("created".to_string()),
            Err(e) => Err(format!(
                "Gagal menginisialisasi folder server ({}): {}. Pastikan aplikasi dijalankan dengan hak akses Administrator (Run as Administrator).",
                www_path.to_string_lossy(),
                e
            )),
        }
    };

    ensure_phpmyadmin_host();
    let _ = register_system_paths();
    res
}

#[tauri::command]
pub fn check_directories_exist(paths: Vec<String>) -> Result<HashMap<String, bool>, String> {
    let mut result = HashMap::new();
    for path in paths {
        let exists = Path::new(&path).exists();
        result.insert(path, exists);
    }
    Ok(result)
}

fn ensure_phpmyadmin_host() {
    let pma_path = get_server_dir_path().join("www").join("phpmyadmin");
    let _ = crate::commands::projects::add_project(
        "phpmyadmin.test".to_string(),
        pma_path.to_string_lossy().to_string(),
        false,
        None,
        false
    );
}

#[tauri::command]
pub fn open_terminal() -> Result<String, String> {
    let server_dir = get_server_dir_path();
    let composer_path = server_dir.join("composer");
    let mysql_bin_path = server_dir.join("mysql").join("bin");
    let redis_path = server_dir.join("redis");

    // Get active PHP version
    let active_php = crate::commands::php::get_active_php_version().unwrap_or("unknown".to_string());
    let php_path = if active_php != "unknown" {
        Some(server_dir.join(&active_php))
    } else {
        None
    };

    // Get current PATH
    let current_path = std::env::var("PATH").unwrap_or_default();

    // Construct new PATH
    let mut new_paths = Vec::new();
    if composer_path.exists() {
        new_paths.push(composer_path.to_string_lossy().to_string());
    }
    if mysql_bin_path.exists() {
        new_paths.push(mysql_bin_path.to_string_lossy().to_string());
    }
    if redis_path.exists() {
        new_paths.push(redis_path.to_string_lossy().to_string());
    }
    if let Some(ref p) = php_path {
        if p.exists() {
            new_paths.push(p.to_string_lossy().to_string());
        }
    }
    new_paths.push(current_path);
    let final_path = new_paths.join(";");

    // Spawn CMD with modified PATH environment variable
    let mut cmd = std::process::Command::new("cmd.exe");
    cmd.args(&["/c", "start cmd.exe"]);
    cmd.env("PATH", final_path);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    cmd.spawn().map_err(|e| format!("Gagal membuka terminal: {}", e))?;

    Ok("Terminal berhasil dibuka.".to_string())
}
