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
            let user = std::env::var("USER").unwrap_or_default();
            if user.is_empty() {
                return Err("Gagal mendeteksi username aktif untuk inisialisasi folder.".to_string());
            }
            let cmd_str = format!("mkdir -p /opt/server && chown -R {0} /opt/server && chmod 755 /opt/server", user);
            let output = crate::execute_elevated_command(&["sh", "-c", &cmd_str])
                .map_err(|e| format!("Gagal membuat /opt/server via perintah elevated: {}", e))?;
                
            if !output.status.success() {
                return Err("Gagal membuat direktori /opt/server. Autentikasi ditolak.".to_string());
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

    #[cfg(target_os = "linux")]
    {
        use std::os::unix::fs::PermissionsExt;
        if www_path.exists() {
            if let Ok(metadata) = fs::metadata(&www_path) {
                let mut perms = metadata.permissions();
                perms.set_mode(0o755);
                let _ = fs::set_permissions(&www_path, perms);
            }
        }
    }

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

#[tauri::command]
pub fn create_desktop_shortcut() -> Result<String, String> {
    Ok("Fitur integrasi menu otomatis telah dinonaktifkan. Anda dapat membuatnya secara manual jika diperlukan.".to_string())
}

#[tauri::command]
pub fn uninstall_envku(app_handle: tauri::AppHandle, delete_data: bool) -> Result<String, String> {
    #[cfg(target_os = "linux")]
    {
        use std::fs;
        use std::path::Path;

        let server_dir = get_server_dir_path();

        // 1. Stop and disable all envku-specific services
        let services = vec!["apache", "mysql", "redis", "mailpit"];
        let mut cmd_parts = Vec::new();
        for service in &services {
            let systemd_service = format!("envku-{}", service);
            cmd_parts.push(format!("systemctl stop {} || true", systemd_service));
            cmd_parts.push(format!("systemctl disable {} || true", systemd_service));
            cmd_parts.push(format!("rm -f /etc/systemd/system/{}.service", systemd_service));
        }
        cmd_parts.push("systemctl daemon-reload".to_string());
        
        let cmd_str = cmd_parts.join("; ");
        let _ = crate::execute_elevated_command(&["sh", "-c", &cmd_str]);

        // 2. Clean up /etc/hosts entries added by Envku
        // Get all virtual hosts domains to clean up
        let mut domains = vec!["phpmyadmin.test".to_string()];
        if let Ok(vhosts) = crate::commands::projects::get_virtual_hosts() {
            for vhost in vhosts {
                if !domains.contains(&vhost.domain) {
                    domains.push(vhost.domain);
                }
            }
        }
        for domain in &domains {
            let _ = crate::platform::hosts::remove_host_entry(domain);
        }

        // 3. Remove system PATH integration from shell files
        if let Ok(home) = std::env::var("HOME") {
            let shell_files = vec![
                format!("{}/.bashrc", home),
                format!("{}/.zshrc", home),
                format!("{}/.profile", home),
            ];

            let path_line = "/opt/server/bin";
            for file_path in shell_files {
                let path = Path::new(&file_path);
                if path.exists() {
                    if let Ok(content) = fs::read_to_string(path) {
                        let lines: Vec<&str> = content.lines().collect();
                        let mut new_lines = Vec::new();
                        let mut skip = false;

                        for line in lines {
                            if line.contains("# Added by Envku") {
                                skip = true;
                                continue;
                            }
                            if skip && line.contains(path_line) {
                                skip = false;
                                continue;
                            }
                            new_lines.push(line);
                        }
                        let _ = fs::write(path, new_lines.join("\n"));
                    }
                }
            }

            // Remove desktop shortcut & icon
            let apps_dir = Path::new(&home).join(".local").join("share").join("applications");
            let icons_dir = Path::new(&home).join(".local").join("share").join("icons");
            let desktop_file = apps_dir.join("envku.desktop");
            let icon_file = icons_dir.join("envku.png");
            
            if desktop_file.exists() {
                let _ = fs::remove_file(desktop_file);
            }
            if icon_file.exists() {
                let _ = fs::remove_file(icon_file);
            }
        }

        // 4. Optionally delete /opt/server directory entirely
        if delete_data {
            if server_dir.exists() {
                if let Err(e) = fs::remove_dir_all(&server_dir) {
                    // Fallback to elevated rm -rf
                    let _ = crate::execute_elevated_command(&["rm", "-rf", &server_dir.to_string_lossy()]);
                    return Err(format!("Gagal menghapus direktori server secara lokal: {}. Namun telah dicoba via elevated command.", e));
                }
            }
        }

        // Exit the application after successful uninstall
        let app_clone = app_handle.clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(1500));
            app_clone.exit(0);
        });

        Ok("Aplikasi berhasil di-uninstall sepenuhnya. Aplikasi akan ditutup dalam beberapa saat.".to_string())
    }

    #[cfg(target_os = "windows")]
    {
        use std::fs;
        use std::path::Path;

        let server_dir = get_server_dir_path();

        // 1. Force kill active server & node processes to release file locks
        let processes = vec![
            "httpd.exe",
            "mysqld.exe",
            "redis-server.exe",
            "mailpit.exe",
            "php.exe",
            "php-cgi.exe",
            "node.exe",
            "nvm.exe",
        ];
        for proc in processes {
            let _ = crate::create_hidden_command("taskkill")
                .args(&["/F", "/T", "/IM", proc])
                .output();
        }

        // 2. Hentikan & hapus service Windows jika ada
        let services = vec![
            "Apache2.4",
            "mysql-server",
            "redis-server",
            "EnvkuApache",
            "EnvkuMySQL",
            "EnvkuRedis",
        ];
        for service in services {
            let _ = crate::create_hidden_command("sc").args(&["stop", service]).output();
            let _ = crate::create_hidden_command("sc").args(&["delete", service]).output();
        }

        // 3. Bersihkan hosts file entries
        let mut domains = vec!["phpmyadmin.test".to_string()];
        if let Ok(vhosts) = crate::commands::projects::get_virtual_hosts() {
            for vhost in vhosts {
                if !domains.contains(&vhost.domain) {
                    domains.push(vhost.domain);
                }
            }
        }
        for domain in &domains {
            let _ = crate::platform::hosts::remove_host_entry(domain);
        }

        // 4. Hapus seluruh Registry Keys terkait Envku
        let reg_keys_to_delete = vec![
            r"HKCU\Software\Envku",
            r"HKLM\Software\Envku",
            r"HKCU\Software\envku",
            r"HKLM\Software\envku",
            r"HKCU\Software\envku\Envku",
            r"HKLM\Software\envku\Envku",
            r"HKCU\Software\Envku-Orchestrator",
            r"HKLM\Software\Envku-Orchestrator",
            r"HKCU\Software\Labib",
            r"HKLM\Software\Labib",
            r"HKCU\Software\Labib\Envku",
            r"HKLM\Software\Labib\Envku",
            r"HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\Envku",
            r"HKLM\Software\Microsoft\Windows\CurrentVersion\Uninstall\Envku",
            r"HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\Envku-Orchestrator",
            r"HKLM\Software\Microsoft\Windows\CurrentVersion\Uninstall\Envku-Orchestrator",
            r"HKLM\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\Envku",
            r"HKLM\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\Envku-Orchestrator",
        ];

        for key in reg_keys_to_delete {
            let _ = crate::create_hidden_command("reg")
                .args(&["delete", key, "/f"])
                .output();
        }

        // Hapus Autostart run key
        let _ = crate::create_hidden_command("reg")
            .args(&["delete", r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run", "/v", "Envku", "/f"])
            .output();
        let _ = crate::create_hidden_command("reg")
            .args(&["delete", r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run", "/v", "Envku-Orchestrator", "/f"])
            .output();

        // 5. Clean System & User PATH environment variables
        let _ = crate::create_hidden_command("powershell.exe")
            .args(&[
                "-Command",
                "$p=[Environment]::GetEnvironmentVariable('Path', 'Machine'); if ($p) { $np=($p -split ';' | Where-Object { $_ -notlike '*server*' -and $_ -notlike '*nvm*' -and $_ -notlike '*nodejs*' }) -join ';'; [Environment]::SetEnvironmentVariable('Path', $np, 'Machine') }"
            ])
            .output();

        let _ = crate::create_hidden_command("powershell.exe")
            .args(&[
                "-Command",
                "$p=[Environment]::GetEnvironmentVariable('Path', 'User'); if ($p) { $np=($p -split ';' | Where-Object { $_ -notlike '*server*' -and $_ -notlike '*nvm*' -and $_ -notlike '*nodejs*' }) -join ';'; [Environment]::SetEnvironmentVariable('Path', $np, 'User') }"
            ])
            .output();

        // 6. Hapus folder server, NVM/Node, & AppData jika delete_data dipilih
        if delete_data {
            // Hapus server_dir
            if server_dir.exists() {
                if fs::remove_dir_all(&server_dir).is_err() {
                    let _ = crate::create_hidden_command("cmd.exe")
                        .args(&["/c", "rmdir", "/s", "/q", &server_dir.to_string_lossy()])
                        .output();
                }
            }

            let default_server = Path::new("C:\\server");
            if default_server.exists() {
                if fs::remove_dir_all(default_server).is_err() {
                    let _ = crate::create_hidden_command("cmd.exe")
                        .args(&["/c", "rmdir", "/s", "/q", "C:\\server"])
                        .output();
                }
            }

            // Clean up NVM and Node.js
            if let Ok(profile) = std::env::var("USERPROFILE") {
                let p = Path::new(&profile);
                
                let nvm_uninstaller_paths = vec![
                    p.join("AppData\\Roaming\\nvm\\unins000.exe"),
                    p.join("AppData\\Local\\nvm\\unins000.exe"),
                    Path::new("C:\\Program Files\\nvm\\unins000.exe").to_path_buf(),
                    Path::new("C:\\Program Files (x86)\\nvm\\unins000.exe").to_path_buf(),
                ];

                for unins in nvm_uninstaller_paths {
                    if unins.exists() {
                        let _ = crate::create_hidden_command(&unins.to_string_lossy())
                            .args(&["/SILENT", "/VERYSILENT", "/SUPPRESSMSGBOXES"])
                            .output();
                    }
                }

                let nvm_dirs_to_remove = vec![
                    p.join("AppData\\Roaming\\nvm"),
                    p.join("AppData\\Local\\nvm"),
                    Path::new("C:\\Program Files\\nvm").to_path_buf(),
                    Path::new("C:\\Program Files (x86)\\nvm").to_path_buf(),
                    Path::new("C:\\Program Files\\nodejs").to_path_buf(),
                ];

                for dir in nvm_dirs_to_remove {
                    if dir.exists() {
                        if fs::remove_dir_all(&dir).is_err() {
                            let _ = crate::create_hidden_command("cmd.exe")
                                .args(&["/c", "rmdir", "/s", "/q", &dir.to_string_lossy()])
                                .output();
                        }
                    }
                }

                // Delete AppData
                let _ = fs::remove_dir_all(p.join("AppData\\Roaming\\com.envku.orchestrator"));
                let _ = fs::remove_dir_all(p.join("AppData\\Local\\com.envku.orchestrator"));
                let _ = fs::remove_dir_all(p.join("AppData\\Roaming\\Envku"));
                let _ = fs::remove_dir_all(p.join("AppData\\Local\\Envku"));
                let _ = fs::remove_dir_all(p.join("AppData\\Roaming\\envku"));
                let _ = fs::remove_dir_all(p.join("AppData\\Local\\envku"));
            }

            // Remove NVM environment variables & uninstaller keys
            let _ = crate::create_hidden_command("reg")
                .args(&["delete", r"HKCU\Environment", "/v", "NVM_HOME", "/f"])
                .output();
            let _ = crate::create_hidden_command("reg")
                .args(&["delete", r"HKCU\Environment", "/v", "NVM_SYMLINK", "/f"])
                .output();
            let _ = crate::create_hidden_command("reg")
                .args(&["delete", r"HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment", "/v", "NVM_HOME", "/f"])
                .output();
            let _ = crate::create_hidden_command("reg")
                .args(&["delete", r"HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment", "/v", "NVM_SYMLINK", "/f"])
                .output();
            let _ = crate::create_hidden_command("reg")
                .args(&["delete", r"HKLM\Software\Microsoft\Windows\CurrentVersion\Uninstall\nvm_is1", "/f"])
                .output();
            let _ = crate::create_hidden_command("reg")
                .args(&["delete", r"HKLM\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\nvm_is1", "/f"])
                .output();
            let _ = crate::create_hidden_command("reg")
                .args(&["delete", r"HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\nvm_is1", "/f"])
                .output();
        }

        // 7. Tutup aplikasi
        let app_clone = app_handle.clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(1500));
            app_clone.exit(0);
        });

        Ok("Seluruh registri, service, NVM/Node, dan aplikasi Envku berhasil dicopot dan dibersihkan.".to_string())
    }

    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    {
        let _ = (app_handle, delete_data);
        Err("Proses uninstall ini belum didukung di OS ini.".to_string())
    }
}

