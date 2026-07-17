use std::fs;
#[cfg(target_os = "windows")]
use std::fs::File;
use std::path::Path;
#[cfg(target_os = "windows")]
use std::io::Write;
#[cfg(target_os = "windows")]
use crate::config::get_server_dir_path;

#[tauri::command]
pub fn get_nvm_versions() -> Result<Vec<String>, String> {
    #[cfg(target_os = "windows")]
    {
        let output = crate::create_hidden_command("powershell.exe")
            .args(&["-Command", "nvm list"])
            .output()
            .map_err(|e| format!("Gagal mengeksekusi nvm list: {}", e))?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        if stdout.contains("nvm") && stdout.contains("not found") {
            return Err("NVM tidak terinstal pada sistem ini.".to_string());
        }

        let mut versions = Vec::new();
        for line in stdout.lines() {
            let clean = line.replace('*', "").trim().to_string();
            if !clean.is_empty() && clean.chars().next().unwrap_or(' ').is_numeric() {
                if let Some(version) = clean.split_whitespace().next() {
                    versions.push(version.to_string());
                }
            }
        }

        // Directory reading fallback
        if versions.is_empty() {
            let mut paths_to_check = Vec::new();
            if let Ok(profile) = std::env::var("USERPROFILE") {
                paths_to_check.push(Path::new(&profile).join("AppData\\Local\\nvm"));
                paths_to_check.push(Path::new(&profile).join("AppData\\Roaming\\nvm"));
            }
            if let Ok(nh) = std::env::var("NVM_HOME") {
                paths_to_check.push(Path::new(&nh).to_path_buf());
            }
            paths_to_check.push(Path::new("C:\\Program Files\\nvm").to_path_buf());
            paths_to_check.push(Path::new("C:\\Program Files (x86)\\nvm").to_path_buf());

            for nvm_path in paths_to_check {
                if nvm_path.exists() {
                    if let Ok(entries) = fs::read_dir(nvm_path) {
                        for entry in entries {
                            if let Ok(entry) = entry {
                                let name = entry.file_name().to_string_lossy().into_owned();
                                if !name.is_empty() && entry.path().is_dir() {
                                    let mut clean_name = name.clone();
                                    if clean_name.starts_with('v') {
                                        clean_name = clean_name[1..].to_string();
                                    }
                                    if !clean_name.is_empty() && clean_name.chars().next().unwrap_or(' ').is_numeric() {
                                        if !versions.contains(&clean_name) {
                                            versions.push(clean_name);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        Ok(versions)
    }

    #[cfg(target_os = "linux")]
    {
        let home = std::env::var("HOME").map_err(|e| format!("Gagal mendapatkan HOME dir: {}", e))?;
        let nvm_sh = Path::new(&home).join(".nvm").join("nvm.sh");
        if !nvm_sh.exists() {
            return Err("NVM tidak terinstal pada sistem ini.".to_string());
        }

        let mut versions = Vec::new();

        // 1. Try reading versions directory directly (most reliable & fast)
        let node_versions_dir = Path::new(&home).join(".nvm").join("versions").join("node");
        if node_versions_dir.exists() {
            if let Ok(entries) = fs::read_dir(node_versions_dir) {
                for entry in entries {
                    if let Ok(entry) = entry {
                        let name = entry.file_name().to_string_lossy().into_owned();
                        if !name.is_empty() && entry.path().is_dir() {
                            let mut clean_name = name.clone();
                            if clean_name.starts_with('v') {
                                clean_name = clean_name[1..].to_string();
                            }
                            if !clean_name.is_empty() && clean_name.chars().next().unwrap_or(' ').is_numeric() {
                                if !versions.contains(&clean_name) {
                                    versions.push(clean_name);
                                }
                            }
                        }
                    }
                }
            }
        }

        // 2. Fallback to executing 'nvm list' command (with ANSI escapes stripped)
        if versions.is_empty() {
            let output = std::process::Command::new("bash")
                .args(&["-c", &format!("source {} && nvm list", nvm_sh.to_string_lossy())])
                .output()
                .map_err(|e| format!("Gagal mengeksekusi nvm list: {}", e))?;

            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines() {
                let line_clean = strip_ansi_escapes(line);
                let clean = line_clean.replace("->", "").replace('*', "").trim().to_string();
                if !clean.is_empty() && (clean.starts_with('v') || clean.chars().next().unwrap_or(' ').is_numeric()) {
                    if let Some(version) = clean.split_whitespace().next() {
                        let version_clean = version.replace('v', "");
                        if !version_clean.is_empty() && version_clean.chars().next().unwrap_or(' ').is_numeric() {
                            if !versions.contains(&version_clean) {
                                versions.push(version_clean);
                            }
                        }
                    }
                }
            }
        }

        // Sort versions descending
        versions.sort_by(|a, b| {
            let parse = |s: &str| -> Vec<u32> {
                s.split('.').map(|x| x.parse::<u32>().unwrap_or(0)).collect()
            };
            parse(b).cmp(&parse(a))
        });

        Ok(versions)
    }

    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    {
        Ok(Vec::new())
    }
}

#[tauri::command]
pub fn switch_node_version(version: String) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        let output = crate::create_hidden_command("powershell.exe")
            .args(&["-Command", &format!("nvm use {}", version)])
            .output()
            .map_err(|e| format!("Gagal menjalankan nvm use: {}", e))?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);
        
        if output.status.success() && !stdout.contains("exit status 1") {
            Ok(format!("Berhasil beralih ke Node.js versi {}", version))
        } else {
            Err(format!(
                "Gagal beralih versi Node.js. Pastikan versi tersebut valid dan terinstal di NVM. Log: {} {}",
                stdout.trim(),
                stderr.trim()
            ))
        }
    }

    #[cfg(target_os = "linux")]
    {
        let home = std::env::var("HOME").map_err(|e| format!("Gagal mendapatkan HOME dir: {}", e))?;
        let nvm_sh = Path::new(&home).join(".nvm").join("nvm.sh");
        if !nvm_sh.exists() {
            return Err("NVM tidak terinstal pada sistem ini.".to_string());
        }

        let output = std::process::Command::new("bash")
            .args(&["-c", &format!("source {} && nvm use {} && nvm alias default {}", nvm_sh.to_string_lossy(), version, version)])
            .output()
            .map_err(|e| format!("Gagal menjalankan nvm use: {}", e))?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);

        if output.status.success() {
            Ok(format!("Berhasil beralih ke Node.js versi {}", version))
        } else {
            Err(format!(
                "Gagal beralih versi Node.js. Log: {} {}",
                stdout.trim(),
                stderr.trim()
            ))
        }
    }

    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    {
        Err("Sistem operasi tidak didukung untuk nvm use.".to_string())
    }
}

#[tauri::command]
pub fn install_node_version(version: String) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        let output = crate::create_hidden_command("powershell.exe")
            .args(&["-Command", &format!("nvm install {}", version)])
            .output()
            .map_err(|e| format!("Gagal menjalankan nvm install: {}", e))?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);

        if output.status.success() && !stdout.contains("exit status 1") {
            Ok(format!("Node.js versi {} berhasil diinstal.", version))
        } else {
            Err(format!(
                "Gagal menginstal Node.js versi {}. Pastikan NVM terinstal dan versi tersebut valid. Log: {} {}",
                version,
                stdout.trim(),
                stderr.trim()
            ))
        }
    }

    #[cfg(target_os = "linux")]
    {
        let home = std::env::var("HOME").map_err(|e| format!("Gagal mendapatkan HOME dir: {}", e))?;
        let nvm_sh = Path::new(&home).join(".nvm").join("nvm.sh");
        if !nvm_sh.exists() {
            return Err("NVM tidak terinstal pada sistem ini.".to_string());
        }

        let output = std::process::Command::new("bash")
            .args(&["-c", &format!("source {} && nvm install {}", nvm_sh.to_string_lossy(), version)])
            .output()
            .map_err(|e| format!("Gagal menjalankan nvm install: {}", e))?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);

        if output.status.success() {
            Ok(format!("Node.js versi {} berhasil diinstal.", version))
        } else {
            Err(format!(
                "Gagal menginstal Node.js versi {}. Log: {} {}",
                version,
                stdout.trim(),
                stderr.trim()
            ))
        }
    }

    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    {
        Err("Sistem operasi tidak didukung untuk nvm install.".to_string())
    }
}

#[tauri::command]
pub async fn install_nvm() -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        // 1. Download nvm-setup.zip
        let url = "https://github.com/coreybutler/nvm-windows/releases/download/1.1.12/nvm-setup.zip";
        let client = reqwest::Client::new();
        let response = client.get(url).send().await
            .map_err(|e| format!("Gagal mengunduh NVM installer: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Gagal mengunduh NVM installer (HTTP {}).", response.status()));
        }

        let temp_dir = get_server_dir_path().join("temp");
        fs::create_dir_all(&temp_dir)
            .map_err(|e| format!("Gagal membuat folder temp: {}", e))?;

        let zip_path = temp_dir.join("nvm-setup.zip");
        let mut file = File::create(&zip_path)
            .map_err(|e| format!("Gagal membuat file installer sementara: {}", e))?;

        let content = response.bytes().await
            .map_err(|e| format!("Gagal membaca data download NVM: {}", e))?;
        
        file.write_all(&content)
            .map_err(|e| format!("Gagal menulis data installer ke disk: {}", e))?;
        
        file.flush().unwrap_or(());
        drop(file);

        // 2. Extract ZIP using the shared helper in downloader
        crate::commands::downloader::extract_zip(&zip_path, &temp_dir)?;

        // 3. Execute nvm-setup.exe silently
        let setup_exe = temp_dir.join("nvm-setup.exe");
        if !setup_exe.exists() {
            return Err("File nvm-setup.exe tidak ditemukan di dalam paket ZIP.".to_string());
        }

        let output = crate::create_hidden_command(&setup_exe.to_string_lossy())
            .args(&["/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART"])
            .output()
            .map_err(|e| format!("Gagal menjalankan instalasi NVM: {}", e))?;

        // Cleanup files
        fs::remove_file(&zip_path).unwrap_or(());
        fs::remove_file(&setup_exe).unwrap_or(());

        if output.status.success() {
            // Broadcast environment update so NVM path is registered globally
            let _ = crate::create_hidden_command("powershell.exe")
                .args(&[
                    "-Command",
                    "$signature = @'\n[DllImport(\"user32.dll\", SetLastError = true, CharSet = CharSet.Auto)]\npublic static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint Msg, IntPtr wParam, string lParam, uint fuFlags, uint uTimeout, out IntPtr lpdwResult);\n'@\n$type = Add-Type -MemberDefinition $signature -Name \"Win32\" -Namespace \"Env\" -PassThru\n$type::SendMessageTimeout(0xffff, 0x001A, 0, \"Environment\", 2, 2000, [ref][IntPtr]::Zero) | Out-Null"
                ])
                .output();

            Ok("NVM (Node Version Manager) berhasil terpasang di komputer Anda. Silakan restart aplikasi Labib Env agar perubahan dapat terdeteksi sepenuhnya.".to_string())
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            Err(format!("Instalasi NVM gagal. Stderr: {}", stderr))
        }
    }

    #[cfg(target_os = "linux")]
    {
        let url = "https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh";
        let client = reqwest::Client::new();
        let response = client.get(url).send().await
            .map_err(|e| format!("Gagal mengunduh NVM installer script: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Gagal mengunduh NVM installer script (HTTP {}).", response.status()));
        }

        let script_content = response.text().await
            .map_err(|e| format!("Gagal membaca script installer NVM: {}", e))?;

        let temp_dir = std::env::temp_dir();
        let script_path = temp_dir.join("install_nvm.sh");
        fs::write(&script_path, script_content)
            .map_err(|e| format!("Gagal menulis script installer ke disk: {}", e))?;

        let output = std::process::Command::new("bash")
            .arg(&script_path)
            .output()
            .map_err(|e| format!("Gagal menjalankan NVM installer script: {}", e))?;

        let _ = fs::remove_file(script_path);

        if output.status.success() {
            Ok("NVM (Node Version Manager) berhasil terpasang di Linux. Sila restart aplikasi agar NVM terdeteksi sepenuhnya.".to_string())
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            Err(format!("Instalasi NVM gagal. Stderr: {}", stderr))
        }
    }

    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    {
        Err("Sistem operasi tidak didukung untuk instalasi NVM.".to_string())
    }
}

#[cfg(target_os = "linux")]
fn strip_ansi_escapes(s: &str) -> String {
    let mut result = String::new();
    let mut in_escape = false;
    let mut chars = s.chars().peekable();
    
    while let Some(c) = chars.next() {
        if c == '\x1B' {
            in_escape = true;
            if chars.peek() == Some(&'[') {
                chars.next(); // consume '['
            }
            continue;
        }
        
        if in_escape {
            // ANSI escape sequences end with a character between '@' and '~'
            if c >= '@' && c <= '~' {
                in_escape = false;
            }
            continue;
        }
        
        result.push(c);
    }
    result
}
