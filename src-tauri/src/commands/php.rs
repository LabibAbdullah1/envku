use std::fs;
use crate::config::get_server_dir_path;

#[tauri::command]
pub fn switch_php_version(version_id: String) -> Result<String, String> {
    let server_dir = get_server_dir_path();
    let target_php_path = server_dir.join(&version_id);
    if !target_php_path.exists() {
        return Err(format!("Folder PHP {} tidak ditemukan. Silakan download komponen terlebih dahulu.", version_id));
    }

    #[cfg(target_os = "windows")]
    {
        use winreg::enums::{HKEY_LOCAL_MACHINE, KEY_ALL_ACCESS, KEY_READ};
        use winreg::RegKey;
        let target_php_dir = target_php_path.to_string_lossy().to_string();

        let httpd_conf_path = server_dir.join("Apache24\\conf\\httpd.conf");
        if !httpd_conf_path.exists() {
            return Err(format!("File httpd.conf Apache tidak ditemukan di {}", httpd_conf_path.to_string_lossy()));
        }

        let mut conf_content = fs::read_to_string(&httpd_conf_path)
            .map_err(|e| format!("Gagal membaca httpd.conf: {}", e))?;

        let load_module_pattern = "LoadModule php_module";
        let has_module = conf_content.contains(load_module_pattern);

        let server_dir_slash = server_dir.to_string_lossy().replace('\\', "/");
        let php_module_block = format!(
            r#"# PHP Config
LoadModule php_module "{}/{}/php8apache2_4.dll"
AddHandler application/x-httpd-php .php
PHPIniDir "{}/{}"
"#,
            server_dir_slash, version_id, server_dir_slash, version_id
        );

        if has_module {
            let mut lines: Vec<String> = conf_content.lines().map(|s| s.to_string()).collect();
            let mut php_block_start = None;
            let mut php_block_end = None;

            for (i, line) in lines.iter().enumerate() {
                if line.contains("LoadModule php_module") {
                    php_block_start = Some(i);
                }
                if php_block_start.is_some() && line.contains("PHPIniDir") {
                    php_block_end = Some(i);
                    break;
                }
            }

            if let (Some(start), Some(end)) = (php_block_start, php_block_end) {
                let adjust_start = if start > 0 && lines[start - 1].contains("# PHP Config") {
                    start - 1
                } else {
                    start
                };

                let replacement = vec![
                    format!("# PHP Config"),
                    format!("LoadModule php_module \"{}/{}/php8apache2_4.dll\"", server_dir_slash, version_id),
                    format!("AddHandler application/x-httpd-php .php"),
                    format!("PHPIniDir \"{}/{}\"", server_dir_slash, version_id),
                ];

                lines.splice(adjust_start..=end, replacement);
                conf_content = lines.join("\n");
            } else {
                lines.retain(|l| !l.contains("LoadModule php_module") && !l.contains("PHPIniDir") && !l.contains("php8apache2_4.dll") && !l.contains("AddHandler application/x-httpd-php"));
                lines.push(php_module_block.clone());
                conf_content = lines.join("\n");
            }
        } else {
            if !conf_content.ends_with('\n') {
                conf_content.push('\n');
            }
            conf_content.push_str(&php_module_block);
        }

        fs::write(&httpd_conf_path, &conf_content)
            .map_err(|e| format!("Gagal menyimpan httpd.conf: {}", e))?;

        // Edit PATH Environment Variable (System Registry)
        let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
        let env_key = hklm.open_subkey_with_flags(
            "System\\CurrentControlSet\\Control\\Session Manager\\Environment",
            KEY_READ | KEY_ALL_ACCESS
        ).map_err(|e| format!("Gagal membuka registry PATH: {}. Pastikan dijalankan sebagai Administrator.", e))?;

        let path_val: String = env_key.get_value("Path")
            .map_err(|e| format!("Gagal membaca PATH system registry: {}", e))?;

        let paths: Vec<&str> = path_val.split(';').collect();
        let server_dir_lower = server_dir.to_string_lossy().to_lowercase();
        let check_pattern = format!("{}\\php", server_dir_lower);

        let mut clean_paths: Vec<String> = paths.into_iter()
            .map(|p| p.to_string())
            .filter(|p| {
                let clean = p.to_lowercase();
                !clean.contains(&check_pattern)
            })
            .collect();

        clean_paths.push(target_php_dir.clone());

        let new_path_val = clean_paths.join(";");
        env_key.set_value("Path", &new_path_val)
            .map_err(|e| format!("Gagal menulis PATH baru ke registry: {}", e))?;

        // Refresh Windows environment (broadcast setting change so explorer picks it up)
        let _ = crate::create_hidden_command("powershell.exe")
            .args(&[
                "-Command",
                "$signature = @'\n[DllImport(\"user32.dll\", SetLastError = true, CharSet = CharSet.Auto)]\npublic static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint Msg, IntPtr wParam, string lParam, uint fuFlags, uint uTimeout, out IntPtr lpdwResult);\n'@\n$type = Add-Type -MemberDefinition $signature -Name \"Win32\" -Namespace \"Env\" -PassThru\n$type::SendMessageTimeout(0xffff, 0x001A, 0, \"Environment\", 2, 2000, [ref][IntPtr]::Zero) | Out-Null"
            ])
            .output();

        // Restart Apache
        let _ = crate::commands::services::control_service("Apache2.4".to_string(), "stop".to_string());
        let _ = crate::commands::services::control_service("Apache2.4".to_string(), "start".to_string());
    }

    #[cfg(target_os = "linux")]
    {
        // Gunakan mekanisme symlink untuk Linux
        crate::platform::env_path::set_php_symlink(&version_id)?;
        
        // Disable other mod_php and enable target mod_php
        let target_mod = if version_id == "php83" { "php8.3" } else { "php8.2" };
        let other_mod = if version_id == "php83" { "php8.2" } else { "php8.3" };
        
        // Group a2dismod, a2enmod, and apache restart into a single elevated command
        let cmd_str = format!(
            "a2dismod {} || true; a2enmod {}; systemctl restart envku-apache",
            other_mod, target_mod
        );
        let _ = crate::execute_elevated_command(&["sh", "-c", &cmd_str]);
    }

    Ok(format!("Berhasil beralih ke PHP {}. Apache di-restart dan PATH diperbarui.", version_id.to_uppercase()))
}

#[tauri::command]
pub fn get_active_php_version() -> Result<String, String> {
    let server_dir = get_server_dir_path();

    #[cfg(target_os = "windows")]
    {
        let httpd_conf_path = server_dir.join("Apache24\\conf\\httpd.conf");
        if !httpd_conf_path.exists() {
            return Ok("unknown".to_string());
        }

        let content = fs::read_to_string(httpd_conf_path)
            .map_err(|e| format!("Gagal membaca httpd.conf: {}", e))?;

        for line in content.lines() {
            if line.contains("LoadModule php_module") && !line.trim().starts_with('#') {
                if line.contains("php83") {
                    return Ok("php83".to_string());
                } else if line.contains("php82") {
                    return Ok("php82".to_string());
                }
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        let php_symlink = server_dir.join("bin").join("php");
        if php_symlink.exists() || php_symlink.is_symlink() {
            if let Ok(target) = fs::read_link(&php_symlink) {
                let target_str = target.to_string_lossy();
                if target_str.contains("php83") {
                    return Ok("php83".to_string());
                } else if target_str.contains("php82") {
                    return Ok("php82".to_string());
                }
            }
        }
    }

    Ok("unknown".to_string())
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct PhpExtensionInfo {
    pub name: String,
    pub enabled: bool,
}

#[cfg(target_os = "linux")]
fn get_linux_enabled_extensions(version_id: &str) -> Vec<String> {
    let php_version_dot = if version_id == "php83" { "8.3" } else { "8.2" };
    let php_cmd = format!("php{}", php_version_dot);
    
    let output = std::process::Command::new(php_cmd)
        .arg("-m")
        .output();
        
    let mut enabled_exts = Vec::new();
    if let Ok(out) = output {
        let stdout = String::from_utf8_lossy(&out.stdout);
        for line in stdout.lines() {
            let name = line.trim().to_lowercase();
            if !name.is_empty() {
                enabled_exts.push(name);
            }
        }
    }
    enabled_exts
}

#[tauri::command]
pub fn get_php_extensions(version_id: String) -> Result<Vec<PhpExtensionInfo>, String> {
    let target_extensions = vec![
        "bz2", "curl", "ffi", "fileinfo", "ftp", "gd", "gettext", "gmp", 
        "imap", "intl", "ldap", "mbstring", "exif", "mysqli", "oci8_19", 
        "odbc", "openssl", "pdo_firebird", "pdo_mysql", "pdo_oci", 
        "pdo_odbc", "pdo_pgsql", "pdo_sqlite", "pgsql", "shmop", 
        "snmp", "soap", "sockets", "sodium", "sqlite3", "sysvshm", 
        "tidy", "xsl", "zip", "opcache"
    ];

    #[cfg(target_os = "linux")]
    {
        let enabled_exts = get_linux_enabled_extensions(&version_id);
        let mut result = Vec::new();
        for ext in target_extensions {
            let match_name = ext.to_lowercase();
            let is_enabled = if match_name == "opcache" {
                enabled_exts.contains(&"zend opcache".to_string()) || enabled_exts.contains(&"opcache".to_string())
            } else {
                enabled_exts.contains(&match_name)
            };
            
            result.push(PhpExtensionInfo {
                name: ext.to_string(),
                enabled: is_enabled,
            });
        }
        return Ok(result);
    }

    #[cfg(not(target_os = "linux"))]
    {
        let server_dir = get_server_dir_path();
        let php_ini_path = server_dir.join(&version_id).join("php.ini");
        if !php_ini_path.exists() {
            return Err(format!("File php.ini tidak ditemukan di {}", php_ini_path.to_string_lossy()));
        }

        let content = fs::read_to_string(&php_ini_path)
            .map_err(|e| format!("Gagal membaca php.ini: {}", e))?;

        let mut result = Vec::new();
        for ext in target_extensions {
            let is_zend = ext == "opcache";
            let prefix = if is_zend { "zend_extension" } else { "extension" };
            
            let mut found = false;
            let mut enabled = false;

            for line in content.lines() {
                let trimmed = line.trim();
                let is_commented = trimmed.starts_with(';');
                let clean_line = if is_commented {
                    trimmed[1..].trim()
                } else {
                    trimmed
                };
                
                let clean_line_no_spaces = clean_line.replace(" ", "").replace("\"", "").replace("'", "");
                let expected_match = format!("{}={}", prefix, ext);
                
                if clean_line_no_spaces == expected_match {
                    enabled = !is_commented;
                    found = true;
                    break;
                }
            }

            result.push(PhpExtensionInfo {
                name: ext.to_string(),
                enabled: found && enabled,
            });
        }

        Ok(result)
    }
}

#[tauri::command]
pub fn toggle_php_extension(version_id: String, extension_name: String, enable: bool) -> Result<String, String> {
    #[cfg(target_os = "linux")]
    {
        let cmd = if enable { "phpenmod" } else { "phpdismod" };
        let php_version_dot = if version_id == "php83" { "8.3" } else { "8.2" };
        
        let output = crate::execute_elevated_command(&[cmd, "-v", php_version_dot, &extension_name])
            .map_err(|e| format!("Gagal menjalankan perintah elevated {} -v {} {}: {}", cmd, php_version_dot, extension_name, e))?;
            
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Gagal mengubah status ekstensi {} di Linux: {}", extension_name, stderr.trim()));
        }
        
        // Restart Apache automatically if this is the currently active PHP version!
        let active_php = get_active_php_version().unwrap_or("unknown".to_string());
        if active_php == version_id {
            let _ = crate::commands::services::control_service("apache".to_string(), "restart".to_string());
        }
        
        return Ok(format!("Ekstensi {} berhasil di-{}", extension_name, if enable { "aktifkan" } else { "nonaktifkan" }));
    }

    #[cfg(not(target_os = "linux"))]
    {
        let server_dir = get_server_dir_path();
        let php_ini_path = server_dir.join(&version_id).join("php.ini");
        if !php_ini_path.exists() {
            return Err(format!("File php.ini tidak ditemukan di {}", php_ini_path.to_string_lossy()));
        }

        let content = fs::read_to_string(&php_ini_path)
            .map_err(|e| format!("Gagal membaca php.ini: {}", e))?;

        let is_zend = extension_name == "opcache";
        let prefix = if is_zend { "zend_extension" } else { "extension" };

        let mut new_lines = Vec::new();
        let mut modified = false;

        for line in content.lines() {
            let trimmed = line.trim();
            let is_commented = trimmed.starts_with(';');
            let clean_line = if is_commented {
                trimmed[1..].trim()
            } else {
                trimmed
            };
            
            let clean_line_no_spaces = clean_line.replace(" ", "").replace("\"", "").replace("'", "");
            let expected_match = format!("{}={}", prefix, extension_name);

            if clean_line_no_spaces == expected_match {
                if enable {
                    new_lines.push(format!("{}={}", prefix, extension_name));
                } else {
                    new_lines.push(format!(";{}={}", prefix, extension_name));
                }
                modified = true;
            } else {
                new_lines.push(line.to_string());
            }
        }

        if !modified {
            if enable {
                new_lines.push(format!("{}={}", prefix, extension_name));
            } else {
                new_lines.push(format!(";{}={}", prefix, extension_name));
            }
        }

        fs::write(&php_ini_path, new_lines.join("\n"))
            .map_err(|e| format!("Gagal memperbarui php.ini: {}", e))?;

        // Restart Apache automatically if this is the currently active PHP version!
        let active_php = get_active_php_version().unwrap_or("unknown".to_string());
        if active_php == version_id {
            let _ = crate::commands::services::control_service("Apache2.4".to_string(), "restart".to_string());
        }

        Ok(format!("Ekstensi {} berhasil di-{}", extension_name, if enable { "aktifkan" } else { "nonaktifkan" }))
    }
}
