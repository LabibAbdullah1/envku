use std::fs;
use std::path::Path;
use std::collections::HashMap;
use crate::config::get_server_dir_path;

#[tauri::command]
pub fn check_and_init_environment() -> Result<String, String> {
    let base_path = get_server_dir_path();
    let www_path = base_path.join("www");

    #[cfg(target_os = "linux")]
    {
        if !base_path.exists() {
            // Minta hak akses root untuk membuat /opt/server dan ubah kepemilikannya ke user aktif
            let output = crate::execute_elevated_command(&["mkdir", "-p", "/opt/server"])
                .map_err(|e| format!("Gagal membuat /opt/server via perintah elevated: {}", e))?;
                
            if !output.status.success() {
                return Err("Gagal membuat direktori /opt/server. Autentikasi ditolak.".to_string());
            }

            if let Ok(user) = std::env::var("USER") {
                let _ = crate::execute_elevated_command(&["chown", "-R", &user, "/opt/server"]);
            }
        }
    }

    let res = if base_path.exists() {
        Ok("exists".to_string())
    } else {
        match fs::create_dir_all(&www_path) {
            Ok(_) => Ok("created".to_string()),
            Err(e) => Err(format!(
                "Gagal menginisialisasi folder server ({}): {}.",
                www_path.to_string_lossy(),
                e
            )),
        }
    };

    ensure_phpmyadmin_host();
    let _ = crate::platform::env_path::register_system_paths();
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
    let current_path = std::env::var("PATH").unwrap_or_default();

    #[cfg(target_os = "windows")]
    {
        let composer_path = server_dir.join("composer");
        let mysql_bin_path = server_dir.join("mysql").join("bin");
        let redis_path = server_dir.join("redis");

        let active_php = crate::commands::php::get_active_php_version().unwrap_or("unknown".to_string());
        let php_path = if active_php != "unknown" {
            Some(server_dir.join(&active_php))
        } else {
            None
        };
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

        let mut cmd = std::process::Command::new("cmd.exe");
        cmd.args(&["/c", "start cmd.exe"]);
        cmd.env("PATH", final_path);
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        cmd.spawn().map_err(|e| format!("Gagal membuka terminal: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        // Di Linux, folder bin kita ('/opt/server/bin') menyimpan symlink
        let bin_path = server_dir.join("bin");
        let mut new_paths = Vec::new();
        if bin_path.exists() {
            new_paths.push(bin_path.to_string_lossy().to_string());
        }
        new_paths.push(current_path);
        let final_path = new_paths.join(":");

        // Coba jalankan x-terminal-emulator, gnome-terminal, xterm
        let mut launched = false;
        let terminals = vec!["x-terminal-emulator", "gnome-terminal", "konsole", "xfce4-terminal", "xterm"];
        
        for term in terminals {
            let mut cmd = std::process::Command::new(term);
            cmd.env("PATH", &final_path);
            if cmd.spawn().is_ok() {
                launched = true;
                break;
            }
        }
        
        if !launched {
            return Err("Tidak ada terminal emulator yang ditemukan pada sistem Linux Anda.".to_string());
        }
    }

    Ok("Terminal berhasil dibuka.".to_string())
}

