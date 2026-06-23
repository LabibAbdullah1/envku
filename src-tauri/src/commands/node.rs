use std::fs::{self, File};
use std::path::Path;
use std::io::Write;
use crate::config::get_server_dir_path;

#[tauri::command]
pub fn get_nvm_versions() -> Result<Vec<String>, String> {
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
        if let Ok(profile) = std::env::var("USERPROFILE") {
            let nvm_path = Path::new(&profile).join("AppData\\Roaming\\nvm");
            if nvm_path.exists() {
                if let Ok(entries) = fs::read_dir(nvm_path) {
                    for entry in entries {
                        if let Ok(entry) = entry {
                            let name = entry.file_name().to_string_lossy().into_owned();
                            if !name.is_empty() && name.chars().next().unwrap_or(' ').is_numeric() && entry.path().is_dir() {
                                versions.push(name);
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(versions)
}

#[tauri::command]
pub fn switch_node_version(version: String) -> Result<String, String> {
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

#[tauri::command]
pub fn install_node_version(version: String) -> Result<String, String> {
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

#[tauri::command]
pub async fn install_nvm() -> Result<String, String> {
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
