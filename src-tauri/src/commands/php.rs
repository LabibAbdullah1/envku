use std::fs;
use crate::config::get_server_dir_path;

/// Mengkonfigurasi php.ini agar kompatibel secara sempurna dengan Apache dan phpMyAdmin:
/// 1. Mengatur extension_dir ke absolute path (mencegah mysqli/mbstring gagal dimuat di Apache).
/// 2. Mengabaikan E_DEPRECATED agar phpMyAdmin tidak crash di PHP 8.4+.
/// 3. Memastikan ekstensi penting (mysqli, mbstring, openssl, curl, pdo_mysql, fileinfo, intl, zip) aktif.
/// 4. Mengarahkan session.save_path ke folder temp internal Envku.
pub fn configure_php_ini_for_version(server_dir: &std::path::Path, version_id: &str) -> Result<(), String> {
    let php_dir = server_dir.join(version_id);
    if !php_dir.exists() {
        return Ok(());
    }

    let php_ini_path = php_dir.join("php.ini");
    let mut content = if php_ini_path.exists() {
        fs::read_to_string(&php_ini_path).unwrap_or_default()
    } else {
        let dev_ini = php_dir.join("php.ini-development");
        let prod_ini = php_dir.join("php.ini-production");
        if dev_ini.exists() {
            fs::read_to_string(&dev_ini).unwrap_or_default()
        } else if prod_ini.exists() {
            fs::read_to_string(&prod_ini).unwrap_or_default()
        } else {
            String::new()
        }
    };

    if content.is_empty() {
        return Ok(());
    }

    let server_dir_slash = server_dir.to_string_lossy().replace('\\', "/");
    let ext_dir_slash = format!("{}/{}/ext", server_dir_slash, version_id);

    // 1. Set absolute extension_dir (karena Apache menjalankan proses dari Apache24/bin)
    if content.contains(";extension_dir = \"ext\"") {
        content = content.replace(";extension_dir = \"ext\"", &format!("extension_dir = \"{}\"", ext_dir_slash));
    } else if content.contains("extension_dir = \"ext\"") {
        content = content.replace("extension_dir = \"ext\"", &format!("extension_dir = \"{}\"", ext_dir_slash));
    } else if !content.contains(&format!("extension_dir = \"{}\"", ext_dir_slash)) {
        let mut replaced = false;
        let mut lines: Vec<String> = Vec::new();
        for line in content.lines() {
            let trimmed = line.trim();
            if (trimmed.starts_with("extension_dir =") || trimmed.starts_with(";extension_dir =")) && !replaced {
                lines.push(format!("extension_dir = \"{}\"", ext_dir_slash));
                replaced = true;
            } else {
                lines.push(line.to_string());
            }
        }
        if !replaced {
            lines.push(format!("extension_dir = \"{}\"", ext_dir_slash));
        }
        content = lines.join("\n");
    }

    // 2. Meredam peringatan E_DEPRECATED agar tidak merusak session & header phpMyAdmin di PHP 8.4+
    if content.contains("error_reporting = E_ALL") && !content.contains("& ~E_DEPRECATED") {
        content = content.replace(
            "error_reporting = E_ALL",
            "error_reporting = E_ALL & ~E_DEPRECATED & ~E_STRICT & ~E_NOTICE"
        );
    }

    // 3. Aktifkan modul-modul esensial untuk phpMyAdmin dan Laravel
    let required_extensions = [
        "curl", "fileinfo", "gd", "intl", "mbstring", "mysqli", "openssl", "pdo_mysql", "zip"
    ];
    for ext in required_extensions {
        let is_already_active = content.lines().any(|l| {
            let t = l.trim();
            !t.starts_with(';') && is_real_extension_line(t, ext, false)
        });

        if !is_already_active {
            let mut line_replaced = false;
            let mut new_lines = Vec::new();
            for l in content.lines() {
                if !line_replaced && l.trim().starts_with(';') && is_real_extension_line(l, ext, false) {
                    new_lines.push(format!("extension={}", ext));
                    line_replaced = true;
                } else {
                    new_lines.push(l.to_string());
                }
            }
            if line_replaced {
                content = new_lines.join("\n");
            } else {
                content.push_str(&format!("\nextension={}\n", ext));
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        let php_version_dot = match version_id {
            "php85" => "8.5",
            "php84" => "8.4",
            "php83" => "8.3",
            _ => "8.2",
        };
        for ext in &required_extensions {
            let _ = crate::execute_elevated_command(&["phpenmod", "-v", php_version_dot, ext]);
        }
        let _ = crate::execute_elevated_command(&["phpenmod", "-v", php_version_dot, "opcache"]);
    }

    // 4. Konfigurasi OPcache untuk performa maksimal autoload Laravel di Windows
    let is_opcache_active = content.lines().any(|l| {
        let t = l.trim();
        !t.starts_with(';') && is_real_extension_line(t, "opcache", true)
    });
    if !is_opcache_active {
        let mut line_replaced = false;
        let mut new_lines = Vec::new();
        for l in content.lines() {
            if !line_replaced && l.trim().starts_with(';') && is_real_extension_line(l, "opcache", true) {
                new_lines.push("zend_extension=opcache".to_string());
                line_replaced = true;
            } else {
                new_lines.push(l.to_string());
            }
        }
        if line_replaced {
            content = new_lines.join("\n");
        } else {
            content.push_str("\nzend_extension=opcache\n");
        }
    }

    let opcache_settings = [
        ("opcache.enable", "1"),
        ("opcache.enable_cli", "0"),
        ("opcache.memory_consumption", "128"),
        ("opcache.interned_strings_buffer", "16"),
        ("opcache.max_accelerated_files", "10000"),
        ("opcache.validate_timestamps", "1"),
        ("opcache.revalidate_freq", "0"),
    ];

    for (key, val) in opcache_settings {
        let prefix = format!("{} =", key);
        let prefix_no_space = format!("{}=", key);
        let mut found = false;
        let mut new_lines = Vec::new();
        for l in content.lines() {
            let trimmed = l.trim();
            let clean = trimmed.trim_start_matches(';').trim_start();
            if clean.starts_with(&prefix) || clean.starts_with(&prefix_no_space) {
                new_lines.push(format!("{} = {}", key, val));
                found = true;
            } else {
                new_lines.push(l.to_string());
            }
        }
        if found {
            content = new_lines.join("\n");
        } else {
            content.push_str(&format!("\n{} = {}\n", key, val));
        }
    }

    // 5. Pastikan session.save_path mengarah ke folder temp yang valid
    let temp_dir = server_dir.join("temp");
    let _ = fs::create_dir_all(&temp_dir);
    let temp_dir_slash = temp_dir.to_string_lossy().replace('\\', "/");
    if content.contains(";session.save_path = \"/tmp\"") {
        content = content.replace(
            ";session.save_path = \"/tmp\"",
            &format!("session.save_path = \"{}\"", temp_dir_slash)
        );
    } else if content.contains(";session.save_path = \"N;/path\"") {
        content = content.replace(
            ";session.save_path = \"N;/path\"",
            &format!("session.save_path = \"{}\"", temp_dir_slash)
        );
    }

    let _ = fs::write(&php_ini_path, content);
    Ok(())
}

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

        // 1. Perbarui dan validasi konfigurasi php.ini untuk versi target
        let _ = configure_php_ini_for_version(&server_dir, &version_id);

        let apache_dir = server_dir.join("Apache24");
        let httpd_conf_path = apache_dir.join("conf").join("httpd.conf");
        if !httpd_conf_path.exists() {
            return Err(format!("File httpd.conf Apache tidak ditemukan di {}", httpd_conf_path.to_string_lossy()));
        }

        let extra_dir = apache_dir.join("conf").join("extra");
        let _ = fs::create_dir_all(&extra_dir);
        let php_conf_path = extra_dir.join("httpd-php.conf");

        let server_dir_slash = server_dir.to_string_lossy().replace('\\', "/");

        // Muat php8ts.dll secara eksplisit terlebih dahulu dengan LoadFile agar Apache
        // tidak mencari dari PATH (yang mungkin masih menunjuk ke versi lama dalam memori service Windows).
        let php_ts_dll = target_php_path.join("php8ts.dll");
        let load_file_line = if php_ts_dll.exists() {
            format!("LoadFile \"{}/{}/php8ts.dll\"\n", server_dir_slash, version_id)
        } else {
            String::new()
        };

        let php_module_block = format!(
            r#"# Envku Modular PHP Configuration
# Diperbarui secara otomatis saat memilih versi PHP di PHP Switcher
{}LoadModule php_module "{}/{}/php8apache2_4.dll"
AddHandler application/x-httpd-php .php
PHPIniDir "{}/{}"
"#,
            load_file_line, server_dir_slash, version_id, server_dir_slash, version_id
        );

        // Tulis konfigurasi PHP ke berkas modular httpd-php.conf
        fs::write(&php_conf_path, &php_module_block)
            .map_err(|e| format!("Gagal menyimpan httpd-php.conf: {}", e))?;

        // Pastikan httpd.conf utama memuat berkas modular ini dan membersihkan modul PHP inline lama
        if let Ok(mut main_conf) = fs::read_to_string(&httpd_conf_path) {
            let include_directive = "IncludeOptional conf/extra/httpd-php.conf";
            let mut modified = false;

            // Bersihkan baris inline lama dari httpd.conf
            let mut clean_lines: Vec<String> = Vec::new();
            for line in main_conf.lines() {
                let trimmed = line.trim();
                if trimmed.contains("LoadModule php_module") 
                    || (trimmed.starts_with("PHPIniDir") && trimmed.contains("php8")) 
                    || (trimmed.contains("php8apache2_4.dll"))
                    || (trimmed.starts_with("LoadFile") && trimmed.contains("php8ts.dll")) {
                    modified = true;
                    continue;
                }
                clean_lines.push(line.to_string());
            }

            main_conf = clean_lines.join("\n");

            if !main_conf.contains(include_directive) {
                if !main_conf.ends_with('\n') {
                    main_conf.push('\n');
                }
                main_conf.push_str("\n# Envku Modular PHP Configuration\n");
                main_conf.push_str(include_directive);
                main_conf.push('\n');
                modified = true;
            }

            if modified {
                let _ = fs::write(&httpd_conf_path, main_conf);
            }
        }

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

        // Update PATH in-memory proses saat ini agar tool CLI seperti composer langsung melihat versi baru
        if let Ok(curr_path) = std::env::var("PATH") {
            let mut p_list: Vec<String> = curr_path.split(';').map(|s| s.to_string()).filter(|s| !s.to_lowercase().contains(&check_pattern)).collect();
            p_list.insert(0, target_php_dir);
            std::env::set_var("PATH", p_list.join(";"));
        }

        // Refresh Windows environment
        let _ = crate::create_hidden_command("powershell.exe")
            .args(&[
                "-Command",
                "$signature = @'\n[DllImport(\"user32.dll\", SetLastError = true, CharSet = CharSet.Auto)]\npublic static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint Msg, IntPtr wParam, string lParam, uint fuFlags, uint uTimeout, out IntPtr lpdwResult);\n'@\n$type = Add-Type -MemberDefinition $signature -Name \"Win32\" -Namespace \"Env\" -PassThru\n$type::SendMessageTimeout(0xffff, 0x001A, 0, \"Environment\", 2, 2000, [ref][IntPtr]::Zero) | Out-Null"
            ])
            .output();

        // Restart Apache dengan aman jika service terinstal
        if crate::commands::services::check_service_installed("Apache2.4".to_string()).unwrap_or(false) {
            let _ = crate::commands::services::control_service("Apache2.4".to_string(), "stop".to_string());
            
            // Tunggu hingga proses httpd benar-benar berhenti dan port 80/443 bersih
            for _ in 0..15 {
                if !crate::commands::services::is_port_in_use(80) && !crate::commands::services::is_port_in_use(443) {
                    break;
                }
                std::thread::sleep(std::time::Duration::from_millis(200));
            }
            std::thread::sleep(std::time::Duration::from_millis(300));
            
            let _ = crate::commands::services::control_service("Apache2.4".to_string(), "start".to_string());
        }
    }

    #[cfg(target_os = "linux")]
    {
        // Gunakan mekanisme symlink untuk Linux
        crate::platform::env_path::set_php_symlink(&version_id)?;
        
        // Disable other mod_php and enable target mod_php
        let target_mod = match version_id.as_str() {
            "php85" => "php8.5",
            "php84" => "php8.4",
            "php83" => "php8.3",
            _ => "php8.2",
        };
        let all_mods = vec!["php8.2", "php8.3", "php8.4", "php8.5"];
        let dismod_cmds: Vec<String> = all_mods.into_iter().filter(|m| *m != target_mod).map(|m| format!("a2dismod {} || true", m)).collect();
        let cmd_str = format!("{}; a2enmod {}; systemctl restart envku-apache", dismod_cmds.join("; "), target_mod);
        let _ = crate::execute_elevated_command(&["sh", "-c", &cmd_str]);
    }

    Ok(format!("Berhasil beralih ke PHP {}. Apache di-restart dan PATH diperbarui.", version_id.to_uppercase()))
}

#[tauri::command]
pub fn get_active_php_version() -> Result<String, String> {
    let server_dir = get_server_dir_path();

    #[cfg(target_os = "windows")]
    {
        let extra_php_conf = server_dir.join("Apache24\\conf\\extra\\httpd-php.conf");
        if extra_php_conf.exists() {
            if let Ok(content) = fs::read_to_string(&extra_php_conf) {
                for line in content.lines() {
                    let trimmed = line.trim();
                    if trimmed.starts_with("LoadModule php_module") && !trimmed.starts_with('#') {
                        if trimmed.contains("php85") {
                            return Ok("php85".to_string());
                        } else if trimmed.contains("php84") {
                            return Ok("php84".to_string());
                        } else if trimmed.contains("php83") {
                            return Ok("php83".to_string());
                        } else if trimmed.contains("php82") {
                            return Ok("php82".to_string());
                        }
                    }
                }
            }
        }

        let httpd_conf_path = server_dir.join("Apache24\\conf\\httpd.conf");
        if httpd_conf_path.exists() {
            if let Ok(content) = fs::read_to_string(httpd_conf_path) {
                for line in content.lines() {
                    let trimmed = line.trim();
                    if trimmed.starts_with("LoadModule php_module") && !trimmed.starts_with('#') {
                        if trimmed.contains("php85") {
                            return Ok("php85".to_string());
                        } else if trimmed.contains("php84") {
                            return Ok("php84".to_string());
                        } else if trimmed.contains("php83") {
                            return Ok("php83".to_string());
                        } else if trimmed.contains("php82") {
                            return Ok("php82".to_string());
                        }
                    }
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
                if target_str.contains("php85") {
                    return Ok("php85".to_string());
                } else if target_str.contains("php84") {
                    return Ok("php84".to_string());
                } else if target_str.contains("php83") {
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
    let php_version_dot = match version_id {
        "php85" => "8.5",
        "php84" => "8.4",
        "php83" => "8.3",
        _ => "8.2",
    };
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

#[allow(dead_code)]
fn is_real_extension_line(line: &str, ext_name: &str, is_zend: bool) -> bool {
    let raw_trimmed = line.trim_end();
    let (_is_commented, rest) = if raw_trimmed.starts_with(';') {
        let after_semi = &raw_trimmed[1..];
        if after_semi.starts_with("  ") {
            return false;
        }
        (true, after_semi.trim_start())
    } else {
        let trimmed_start = raw_trimmed.trim_start();
        if raw_trimmed.len() - trimmed_start.len() > 1 {
            return false;
        }
        (false, trimmed_start)
    };

    let expected_prefix = if is_zend { "zend_extension" } else { "extension" };

    if !rest.to_lowercase().starts_with(expected_prefix) {
        return false;
    }

    let parts: Vec<&str> = rest.splitn(2, '=').collect();
    if parts.len() != 2 {
        return false;
    }

    let key = parts[0].trim().to_lowercase();
    if key != expected_prefix {
        return false;
    }

    let value_part = parts[1];
    let val_without_comment = if let Some(idx) = value_part.find(';') {
        &value_part[..idx]
    } else {
        value_part
    };

    let val = val_without_comment.trim().trim_matches('"').trim_matches('\'').to_lowercase();
    let ext_lower = ext_name.to_lowercase();

    let php_dll = format!("php_{}.dll", ext_lower);
    let dll = format!("{}.dll", ext_lower);
    let so = format!("{}.so", ext_lower);
    let php_ext = format!("php_{}", ext_lower);

    val == ext_lower || val == php_dll || val == dll || val == so || val == php_ext
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
            let mut enabled = false;

            for line in content.lines() {
                if is_real_extension_line(line, ext, is_zend) {
                    let trimmed = line.trim();
                    if !trimmed.starts_with(';') {
                        enabled = true;
                        break;
                    }
                }
            }

            result.push(PhpExtensionInfo {
                name: ext.to_string(),
                enabled,
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
        let php_version_dot = match version_id.as_str() {
            "php85" => "8.5",
            "php84" => "8.4",
            "php83" => "8.3",
            _ => "8.2",
        };
        
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
        let mut first_match = true;

        for line in content.lines() {
            if is_real_extension_line(line, &extension_name, is_zend) {
                let parts: Vec<&str> = line.splitn(2, '=').collect();
                let right_side = if parts.len() == 2 { parts[1] } else { &extension_name };
                let clean_right = right_side.trim().trim_start_matches(';').trim();
                
                if enable {
                    if first_match {
                        new_lines.push(format!("{}={}", prefix, clean_right));
                        first_match = false;
                    } else {
                        new_lines.push(format!(";{}={}", prefix, clean_right));
                    }
                } else {
                    new_lines.push(format!(";{}={}", prefix, clean_right));
                }
                modified = true;
            } else {
                new_lines.push(line.to_string());
            }
        }

        if !modified && enable {
            new_lines.push(format!("{}={}", prefix, extension_name));
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
