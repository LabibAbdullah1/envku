#[cfg(target_os = "linux")]
use std::fs;
#[cfg(target_os = "linux")]
use std::path::Path;
use std::path::PathBuf;
#[cfg(target_os = "linux")]
use std::process::Command;

/// Mendapatkan base path server (C:\server di Windows, /opt/server di Linux).
pub fn get_server_dir_path() -> PathBuf {
    if let Ok(val) = std::env::var("ENVKU_SERVER_DIR") {
        return PathBuf::from(val);
    }

    #[cfg(target_os = "windows")]
    {
        use winreg::enums::HKEY_CURRENT_USER;
        use winreg::RegKey;
        
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        if let Ok(key) = hkcu.open_subkey("Software\\envku\\Envku") {
            if let Ok(val) = key.get_value::<String, _>("ServerDir") {
                if !val.is_empty() {
                    return PathBuf::from(val);
                }
            }
        }
        PathBuf::from("C:\\server")
    }

    #[cfg(target_os = "linux")]
    {
        PathBuf::from("/opt/server")
    }

    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    {
        PathBuf::from("/opt/server")
    }
}

/// Menambahkan daftar path folder biner ke system PATH.
pub fn register_system_paths() -> Result<(), String> {
    let server_dir = get_server_dir_path();

    #[cfg(target_os = "windows")]
    {
        use winreg::enums::{HKEY_LOCAL_MACHINE, KEY_ALL_ACCESS, KEY_READ};
        use winreg::RegKey;

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

        let path_val: String = env_key.get_value("Path").unwrap_or_default();
        let existing_paths: Vec<String> = path_val.split(';').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect();
        let mut updated_paths = existing_paths.clone();
        let mut changed = false;

        for path in paths_to_add {
            let path_lower = path.to_lowercase();
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

            // Refresh environment
            let _ = crate::create_hidden_command("powershell.exe")
                .args(&[
                    "-Command",
                    "$signature = @'\n[DllImport(\"user32.dll\", SetLastError = true, CharSet = CharSet.Auto)]\npublic static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint Msg, IntPtr wParam, string lParam, uint fuFlags, uint uTimeout, out IntPtr lpdwResult);\n'@\n$type = Add-Type -MemberDefinition $signature -Name \"Win32\" -Namespace \"Env\" -PassThru\n$type::SendMessageTimeout(0xffff, 0x001A, 0, \"Environment\", 2, 2000, [ref][IntPtr]::Zero) | Out-Null"
                ])
                .output();
        }
        Ok(())
    }

    #[cfg(target_os = "linux")]
    {
        // Di Linux, kita tambahkan '/opt/server/bin' ke dalam shell startup files (~/.bashrc dan ~/.zshrc)
        let home = std::env::var("HOME").map_err(|e| format!("Gagal mendapatkan HOME dir: {}", e))?;
        let bin_path = server_dir.join("bin");
        let path_line = format!("export PATH=\"{}:$PATH\"", bin_path.to_string_lossy());
        
        let shell_files = vec![
            format!("{}/.bashrc", home),
            format!("{}/.zshrc", home),
            format!("{}/.profile", home),
        ];

        for file_path in shell_files {
            let path = Path::new(&file_path);
            if path.exists() {
                let content = fs::read_to_string(path).unwrap_or_default();
                if !content.contains(&bin_path.to_string_lossy().to_string()) {
                    let mut file_content = content;
                    if !file_content.ends_with('\n') && !file_content.is_empty() {
                        file_content.push('\n');
                    }
                    file_content.push_str("\n# Added by Envku\n");
                    file_content.push_str(&path_line);
                    file_content.push('\n');
                    let _ = fs::write(path, file_content);
                }
            }
        }
        Ok(())
    }

    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    {
        Ok(())
    }
}

/// Helper untuk mengaktifkan versi PHP tertentu melalui link simbolik di Linux.
#[cfg(target_os = "linux")]
pub fn set_php_symlink(php_version_dir: &str) -> Result<(), String> {
    let server_dir = get_server_dir_path();
    let bin_dir = server_dir.join("bin");
    let target_php_bin = server_dir.join(php_version_dir).join("bin").join("php");
    let symlink_php_bin = bin_dir.join("php");

    // Pastikan folder bin ada
    if !bin_dir.exists() {
        fs::create_dir_all(&bin_dir)
            .map_err(|e| format!("Gagal membuat direktori bin: {}", e))?;
    }

    // Hapus symlink lama jika ada
    if symlink_php_bin.exists() || symlink_php_bin.is_symlink() {
        let _ = fs::remove_file(&symlink_php_bin);
    }

    if target_php_bin.exists() {
        // Buat symlink baru
        std::os::unix::fs::symlink(&target_php_bin, &symlink_php_bin)
            .map_err(|e| format!("Gagal membuat symlink PHP: {}", e))?;
            
        // Buat juga symlink untuk Composer jika ada
        let target_composer = server_dir.join("composer").join("composer.phar");
        let symlink_composer = bin_dir.join("composer");
        if target_composer.exists() {
            if symlink_composer.exists() || symlink_composer.is_symlink() {
                let _ = fs::remove_file(&symlink_composer);
            }
            // Kita bisa jalankan composer dengan menulis wrapper script di ~/server/bin/composer
            let wrapper_content = format!(
                "#!/bin/sh\nexec php \"{}\" \"$@\"\n",
                target_composer.to_string_lossy()
            );
            fs::write(&symlink_composer, wrapper_content)
                .map_err(|e| format!("Gagal menulis wrapper composer: {}", e))?;
            
            // Set execute permission
            let _ = Command::new("chmod")
                .args(&["+x", &symlink_composer.to_string_lossy()])
                .status();
        }
    }
    
    Ok(())
}
