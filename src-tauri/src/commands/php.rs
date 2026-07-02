use std::fs;
use winreg::enums::{HKEY_LOCAL_MACHINE, KEY_ALL_ACCESS, KEY_READ};
use winreg::RegKey;
use crate::config::get_server_dir_path;

#[tauri::command]
pub fn switch_php_version(version_id: String) -> Result<String, String> {
    let server_dir = get_server_dir_path();
    let target_php_path = server_dir.join(&version_id);
    let target_php_dir = target_php_path.to_string_lossy().to_string();
    if !target_php_path.exists() {
        return Err(format!("Folder PHP {} tidak ditemukan. Silakan download komponen terlebih dahulu.", version_id));
    }

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

    Ok(format!("Berhasil beralih ke PHP {}. Apache di-restart dan PATH diperbarui.", version_id.to_uppercase()))
}

#[tauri::command]
pub fn get_active_php_version() -> Result<String, String> {
    let server_dir = get_server_dir_path();
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

    Ok("unknown".to_string())
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct PhpExtensionInfo {
    pub name: String,
    pub enabled: bool,
}

#[tauri::command]
pub fn get_php_extensions(version_id: String) -> Result<Vec<PhpExtensionInfo>, String> {
    let server_dir = get_server_dir_path();
    let php_ini_path = server_dir.join(&version_id).join("php.ini");
    if !php_ini_path.exists() {
        return Err(format!("File php.ini tidak ditemukan di {}", php_ini_path.to_string_lossy()));
    }

    let content = fs::read_to_string(&php_ini_path)
        .map_err(|e| format!("Gagal membaca php.ini: {}", e))?;

    let target_extensions = vec![
        "curl", "fileinfo", "gd", "intl", "mbstring", "mysqli", 
        "openssl", "pdo_mysql", "pdo_sqlite", "sqlite3", "zip"
    ];

    let mut result = Vec::new();
    for ext in target_extensions {
        let enabled_pattern = format!("extension={}", ext);
        let disabled_pattern = format!(";extension={}", ext);
        
        let mut found = false;
        let mut enabled = false;

        for line in content.lines() {
            let trimmed = line.trim();
            if trimmed == enabled_pattern {
                enabled = true;
                found = true;
                break;
            } else if trimmed == disabled_pattern {
                enabled = false;
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

#[tauri::command]
pub fn toggle_php_extension(version_id: String, extension_name: String, enable: bool) -> Result<String, String> {
    let server_dir = get_server_dir_path();
    let php_ini_path = server_dir.join(&version_id).join("php.ini");
    if !php_ini_path.exists() {
        return Err(format!("File php.ini tidak ditemukan di {}", php_ini_path.to_string_lossy()));
    }

    let content = fs::read_to_string(&php_ini_path)
        .map_err(|e| format!("Gagal membaca php.ini: {}", e))?;

    let enabled_pattern = format!("extension={}", extension_name);
    let disabled_pattern = format!(";extension={}", extension_name);

    let mut new_lines = Vec::new();
    let mut modified = false;

    for line in content.lines() {
        let trimmed = line.trim();
        if enable {
            if trimmed == disabled_pattern {
                new_lines.push(enabled_pattern.clone());
                modified = true;
            } else {
                new_lines.push(line.to_string());
            }
        } else {
            if trimmed == enabled_pattern {
                new_lines.push(disabled_pattern.clone());
                modified = true;
            } else {
                new_lines.push(line.to_string());
            }
        }
    }

    if !modified {
        if enable {
            new_lines.push(enabled_pattern);
        } else {
            new_lines.push(disabled_pattern);
        }
    }

    fs::write(&php_ini_path, new_lines.join("\n"))
        .map_err(|e| format!("Gagal memperbarui php.ini: {}", e))?;

    // Restart Apache automatically if this is the currently active PHP version!
    let active_php = get_active_php_version().unwrap_or("unknown".to_string());
    if active_php == version_id {
        let _ = crate::commands::services::control_service("Apache2.4".to_string(), "stop".to_string());
        let _ = crate::commands::services::control_service("Apache2.4".to_string(), "start".to_string());
    }

    Ok(format!("Ekstensi {} berhasil di-{}", extension_name, if enable { "aktifkan" } else { "nonaktifkan" }))
}
