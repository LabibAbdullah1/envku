use std::fs;
#[cfg(target_os = "windows")]
use std::fs::File;
use std::path::{Path, PathBuf};
#[cfg(target_os = "windows")]
use std::io::Write;
#[cfg(target_os = "windows")]
use crate::config::get_server_dir_path;

#[cfg(target_os = "windows")]
fn find_windows_nvm_exe() -> Option<PathBuf> {
    if let Ok(nh) = std::env::var("NVM_HOME") {
        let p = Path::new(&nh).join("nvm.exe");
        if p.exists() {
            return Some(p);
        }
    }
    if let Ok(profile) = std::env::var("USERPROFILE") {
        let roaming = Path::new(&profile).join("AppData\\Roaming\\nvm\\nvm.exe");
        if roaming.exists() {
            return Some(roaming);
        }
        let local = Path::new(&profile).join("AppData\\Local\\nvm\\nvm.exe");
        if local.exists() {
            return Some(local);
        }
    }
    let pf = Path::new("C:\\Program Files\\nvm\\nvm.exe");
    if pf.exists() {
        return Some(pf.to_path_buf());
    }
    let pfx86 = Path::new("C:\\Program Files (x86)\\nvm\\nvm.exe");
    if pfx86.exists() {
        return Some(pfx86.to_path_buf());
    }
    None
}

#[cfg(target_os = "windows")]
fn get_windows_nvm_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Ok(profile) = std::env::var("USERPROFILE") {
        dirs.push(Path::new(&profile).join("AppData\\Roaming\\nvm"));
        dirs.push(Path::new(&profile).join("AppData\\Local\\nvm"));
    }
    if let Ok(nh) = std::env::var("NVM_HOME") {
        dirs.push(PathBuf::from(nh));
    }
    dirs.push(PathBuf::from("C:\\Program Files\\nvm"));
    dirs.push(PathBuf::from("C:\\Program Files (x86)\\nvm"));
    dirs
}

#[cfg(target_os = "windows")]
fn get_primary_nvm_root() -> PathBuf {
    if let Ok(nh) = std::env::var("NVM_HOME") {
        let p = PathBuf::from(nh);
        if p.exists() {
            return p;
        }
    }
    if let Ok(profile) = std::env::var("USERPROFILE") {
        let roaming = Path::new(&profile).join("AppData\\Roaming\\nvm");
        if roaming.exists() {
            return roaming;
        }
    }
    for d in get_windows_nvm_dirs() {
        if d.exists() {
            return d;
        }
    }
    if let Ok(profile) = std::env::var("USERPROFILE") {
        Path::new(&profile).join("AppData\\Roaming\\nvm")
    } else {
        PathBuf::from("C:\\Program Files\\nvm")
    }
}

#[cfg(target_os = "windows")]
fn get_nodejs_symlink_path() -> PathBuf {
    if let Ok(ns) = std::env::var("NVM_SYMLINK") {
        return PathBuf::from(ns);
    }
    let nvm_root = get_primary_nvm_root();
    let settings_file = nvm_root.join("settings.txt");
    if settings_file.exists() {
        if let Ok(content) = fs::read_to_string(&settings_file) {
            for line in content.lines() {
                let parts: Vec<&str> = line.splitn(2, ':').collect();
                if parts.len() == 2 && parts[0].trim().eq_ignore_ascii_case("path") {
                    let p = parts[1].trim();
                    if !p.is_empty() {
                        return PathBuf::from(p);
                    }
                }
            }
        }
    }
    PathBuf::from("C:\\Program Files\\nodejs")
}

#[cfg(target_os = "windows")]
fn extract_node_zip(zip_path: &Path, target_dir: &Path) -> Result<(), String> {
    use zip::ZipArchive;
    let file = File::open(zip_path).map_err(|e| format!("Gagal membuka file ZIP Node.js: {}", e))?;
    let mut archive = ZipArchive::new(file).map_err(|e| format!("Gagal membaca arsip ZIP Node.js: {}", e))?;

    fs::create_dir_all(target_dir).map_err(|e| format!("Gagal membuat direktori target: {}", e))?;

    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| format!("Gagal membaca index file ZIP: {}", e))?;
        let raw_name = match file.enclosed_name() {
            Some(p) => p.to_path_buf(),
            None => continue,
        };

        // Hilangkan nama folder induk dalam zip (contoh: "node-v22.14.0-win-x64/")
        let relative_path: PathBuf = raw_name.components().skip(1).collect();
        if relative_path.as_os_str().is_empty() {
            continue;
        }

        let outpath = target_dir.join(&relative_path);

        if file.name().ends_with('/') || file.is_dir() {
            fs::create_dir_all(&outpath).map_err(|e| format!("Gagal membuat direktori: {}", e))?;
        } else {
            if let Some(p) = outpath.parent() {
                if !p.exists() {
                    fs::create_dir_all(p).map_err(|e| format!("Gagal membuat direktori induk: {}", e))?;
                }
            }
            let mut outfile = File::create(&outpath).map_err(|e| format!("Gagal membuat file tujuan: {}", e))?;
            std::io::copy(&mut file, &mut outfile).map_err(|e| format!("Gagal mengekstrak file {}: {}", relative_path.display(), e))?;
        }
    }
    Ok(())
}

#[cfg(target_os = "windows")]
async fn download_and_extract_windows_node(version: &str, target_dir: &Path) -> Result<(), String> {
    use std::fs::OpenOptions;
    use futures_util::StreamExt;

    let primary_url = format!("https://nodejs.org/dist/v{}/node-v{}-win-x64.zip", version, version);
    let fallback_url = format!("https://cdn.npmmirror.com/binaries/node/v{}/node-v{}-win-x64.zip", version, version);

    let temp_dir = get_server_dir_path().join("temp");
    fs::create_dir_all(&temp_dir).map_err(|e| format!("Gagal membuat direktori temp: {}", e))?;

    let zip_path = temp_dir.join(format!("node-v{}-win-x64.zip", version));
    let part_path = temp_dir.join(format!("node-v{}-win-x64.part", version));

    let is_valid_zip = |p: &Path| -> bool {
        if let Ok(f) = File::open(p) {
            zip::ZipArchive::new(f).is_ok()
        } else {
            false
        }
    };

    if !zip_path.exists() || !is_valid_zip(&zip_path) {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(180))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());

        let mut download_success = false;
        let mut last_err = String::new();

        for url in &[primary_url.as_str(), fallback_url.as_str()] {
            for attempt in 1..=3 {
                let existing_bytes = if part_path.exists() {
                    fs::metadata(&part_path).map(|m| m.len()).unwrap_or(0)
                } else {
                    0
                };

                let mut req = client.get(*url);
                if existing_bytes > 0 {
                    req = req.header("Range", format!("bytes={}-", existing_bytes));
                }

                let response = match req.send().await {
                    Ok(r) => r,
                    Err(e) => {
                        last_err = format!("Koneksi gagal: {}", e);
                        tokio::time::sleep(std::time::Duration::from_millis(500 * attempt)).await;
                        continue;
                    }
                };

                let status = response.status();
                let mut file = if status == reqwest::StatusCode::PARTIAL_CONTENT {
                    match OpenOptions::new().create(true).append(true).open(&part_path) {
                        Ok(f) => f,
                        Err(e) => {
                            last_err = format!("Gagal membuka file part: {}", e);
                            continue;
                        }
                    }
                } else if status.is_success() {
                    match File::create(&part_path) {
                        Ok(f) => f,
                        Err(e) => {
                            last_err = format!("Gagal membuat file part: {}", e);
                            continue;
                        }
                    }
                } else {
                    last_err = format!("HTTP {}", status);
                    continue;
                };

                let mut stream = response.bytes_stream();
                let mut stream_err = false;
                while let Some(chunk_res) = stream.next().await {
                    match chunk_res {
                        Ok(chunk) => {
                            if let Err(e) = file.write_all(&chunk) {
                                last_err = format!("Gagal menulis stream: {}", e);
                                stream_err = true;
                                break;
                            }
                        }
                        Err(e) => {
                            last_err = format!("Stream terputus: {}", e);
                            stream_err = true;
                            break;
                        }
                    }
                }

                if !stream_err {
                    let _ = file.flush();
                    drop(file);
                    if let Err(e) = fs::rename(&part_path, &zip_path) {
                        last_err = format!("Gagal menyimpan zip final: {}", e);
                    } else if is_valid_zip(&zip_path) {
                        download_success = true;
                        break;
                    } else {
                        let _ = fs::remove_file(&zip_path);
                    }
                }
            }

            if download_success {
                break;
            }
        }

        if !download_success {
            let _ = fs::remove_file(&part_path);
            return Err(format!(
                "Gagal mengunduh Node.js v{}. Pastikan koneksi internet stabil. Detail: {}",
                version, last_err
            ));
        }
    }

    // Ekstrak ZIP ke target directory
    extract_node_zip(&zip_path, target_dir)?;

    // Bersihkan file zip sementara
    let _ = fs::remove_file(&zip_path);

    if !target_dir.join("node.exe").exists() {
        return Err(format!("Instalasi gagal: node.exe tidak ditemukan setelah ekstraksi di {}", target_dir.display()));
    }

    Ok(())
}

#[cfg(target_os = "windows")]
fn switch_windows_node_symlink(target_dir: &Path, symlink_path: &Path) -> Result<(), String> {
    // 1. Coba hapus symlink lama jika ada
    if symlink_path.exists() || symlink_path.is_symlink() {
        let _ = fs::remove_dir(symlink_path);
        let _ = fs::remove_file(symlink_path);
    }

    // 2. Coba buat symlink secara langsung (berhasil jika aplikasi berjalan sebagai Administrator atau Developer Mode aktif)
    if std::os::windows::fs::symlink_dir(target_dir, symlink_path).is_ok() {
        return Ok(());
    }

    // 3. Jika gagal, jalankan elevated PowerShell (UAC RunAs) untuk menghapus dan memperbarui symlink
    let target_str = target_dir.to_string_lossy();
    let symlink_str = symlink_path.to_string_lossy();

    let ps_cmd = format!(
        "if (Test-Path -LiteralPath '{}') {{ (Get-Item -LiteralPath '{}').Delete() }}; New-Item -ItemType SymbolicLink -Path '{}' -Target '{}' -Force",
        symlink_str, symlink_str, symlink_str, target_str
    );

    let ps_elevated = format!(
        "Start-Process powershell.exe -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList '-NoProfile -NonInteractive -ExecutionPolicy Bypass -Command \"{}\"'",
        ps_cmd.replace('"', "\"\"")
    );

    let output = crate::create_hidden_command("powershell.exe")
        .args(&["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", &ps_elevated])
        .output()
        .map_err(|e| format!("Gagal eskalasi hak akses administrator: {}", e))?;

    if symlink_path.exists() && symlink_path.join("node.exe").exists() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!(
            "Gagal memperbarui symlink Node.js di {}. Pastikan Anda menyetujui izin Administrator saat diminta. Log: {}",
            symlink_path.display(),
            stderr.trim()
        ))
    }
}

#[tauri::command]
pub async fn get_nvm_versions() -> Result<Vec<String>, String> {
    tokio::task::spawn_blocking(move || {
        #[cfg(target_os = "windows")]
        {
            let mut versions = Vec::new();

            // 1. Direct directory scan: tercepat, tidak bergantung pada PowerShell execution policy
            for nvm_path in get_windows_nvm_dirs() {
                if nvm_path.exists() {
                    if let Ok(entries) = fs::read_dir(&nvm_path) {
                        for entry in entries.flatten() {
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

            // Cek apakah NVM terpasang
            if versions.is_empty() && find_windows_nvm_exe().is_none() && !get_windows_nvm_dirs().iter().any(|d| d.exists()) {
                return Err("NVM tidak terinstal pada sistem ini.".to_string());
            }

            // Sort descending
            versions.sort_by(|a, b| {
                let parse = |s: &str| -> Vec<u32> {
                    s.split('.').map(|x| x.parse::<u32>().unwrap_or(0)).collect()
                };
                parse(b).cmp(&parse(a))
            });

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
                    for entry in entries.flatten() {
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
    })
    .await
    .map_err(|e| format!("Gagal memeriksa versi NVM: {}", e))?
}

async fn resolve_node_version(input: &str) -> Result<String, String> {
    let clean = input.trim().trim_start_matches('v').to_lowercase();
    if clean.is_empty() {
        return Err("Versi Node.js tidak boleh kosong.".to_string());
    }

    // 1. Jika sudah merupakan semantic version lengkap (misal: "24.22.2", "20.18.3")
    let parts: Vec<&str> = clean.split('.').collect();
    if parts.len() == 3 && parts.iter().all(|p| p.chars().all(|c| c.is_ascii_digit())) {
        return Ok(clean);
    }

    // 2. Pemetaan fallback offline (untuk rilis stabil resmi nodejs.org)
    let fallback = match clean.as_str() {
        "18" => Some("18.20.8"),
        "20" => Some("20.20.2"),
        "22" => Some("22.23.4"),
        "24" => Some("24.22.2"),
        "lts" => Some("24.22.2"),
        "latest" => Some("24.22.2"),
        _ => None,
    };

    // 3. Coba resolusi online ke https://nodejs.org/dist/index.json (timeout 4 detik)
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(4))
        .build();

    if let Ok(client) = client {
        if let Ok(resp) = client.get("https://nodejs.org/dist/index.json").send().await {
            if let Ok(releases) = resp.json::<Vec<serde_json::Value>>().await {
                for rel in &releases {
                    if let Some(v_str) = rel.get("version").and_then(|v| v.as_str()) {
                        let ver_num = v_str.trim_start_matches('v');
                        if clean == "lts" {
                            if let Some(lts) = rel.get("lts") {
                                if !lts.is_null() && (!lts.is_boolean() || lts.as_bool() == Some(true)) {
                                    return Ok(ver_num.to_string());
                                }
                            }
                        } else if clean == "latest" {
                            return Ok(ver_num.to_string());
                        } else if ver_num == clean || ver_num.starts_with(&format!("{}.", clean)) {
                            return Ok(ver_num.to_string());
                        }
                    }
                }
            }
        }
    }

    // 4. Jika resolusi online gagal atau timeout, gunakan fallback offline
    if let Some(fb) = fallback {
        return Ok(fb.to_string());
    }

    Ok(clean)
}

#[tauri::command]
pub async fn switch_node_version(version: String) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        tokio::task::spawn_blocking(move || {
            let clean_ver = version.trim().trim_start_matches('v');

            // Cari folder versi yang terinstal di direktori NVM
            let mut target_dir_opt = None;
            for nvm_dir in get_windows_nvm_dirs() {
                if nvm_dir.exists() {
                    let v_dir = nvm_dir.join(format!("v{}", clean_ver));
                    let plain_dir = nvm_dir.join(clean_ver);
                    if v_dir.exists() && v_dir.join("node.exe").exists() {
                        target_dir_opt = Some(v_dir);
                        break;
                    } else if plain_dir.exists() && plain_dir.join("node.exe").exists() {
                        target_dir_opt = Some(plain_dir);
                        break;
                    }
                }
            }

            let target_dir = match target_dir_opt {
                Some(p) => p,
                None => return Err(format!("Versi Node.js {} belum terpasang. Silakan unduh terlebih dahulu.", version)),
            };

            let symlink_path = get_nodejs_symlink_path();
            switch_windows_node_symlink(&target_dir, &symlink_path)?;

            // Update PATH in-memory agar langsung aktif pada sesi aplikasi
            if let Ok(curr_path) = std::env::var("PATH") {
                let sym_str = symlink_path.to_string_lossy().to_string();
                if !curr_path.to_lowercase().contains(&sym_str.to_lowercase()) {
                    std::env::set_var("PATH", format!("{};{}", sym_str, curr_path));
                }
            }

            Ok(format!("Berhasil beralih ke Node.js versi {}", clean_ver))
        })
        .await
        .map_err(|e| format!("Proses switch Node.js gagal: {}", e))?
    }

    #[cfg(target_os = "linux")]
    {
        tokio::task::spawn_blocking(move || {
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
        })
        .await
        .map_err(|e| format!("Proses switch Node.js gagal: {}", e))?
    }

    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    {
        let _ = version;
        Err("Sistem operasi tidak didukung untuk nvm use.".to_string())
    }
}

#[tauri::command]
pub async fn install_node_version(version: String) -> Result<String, String> {
    let resolved_version = resolve_node_version(&version).await?;
    let ver_to_install = resolved_version.clone();

    #[cfg(target_os = "windows")]
    {
        // Cek apakah versi ini sudah terpasang di salah satu folder NVM
        for nvm_dir in get_windows_nvm_dirs() {
            if nvm_dir.exists() {
                let v_dir = nvm_dir.join(format!("v{}", ver_to_install));
                let plain_dir = nvm_dir.join(&ver_to_install);
                if (v_dir.exists() && v_dir.join("node.exe").exists())
                    || (plain_dir.exists() && plain_dir.join("node.exe").exists())
                {
                    return Ok(format!("Node.js v{} sudah terpasang pada sistem Anda.", ver_to_install));
                }
            }
        }

        let nvm_root = get_primary_nvm_root();
        let target_dir = nvm_root.join(format!("v{}", ver_to_install));

        download_and_extract_windows_node(&ver_to_install, &target_dir).await?;

        Ok(format!("Node.js versi {} berhasil diinstal.", ver_to_install))
    }

    #[cfg(target_os = "linux")]
    {
        tokio::task::spawn_blocking(move || {
            let home = std::env::var("HOME").map_err(|e| format!("Gagal mendapatkan HOME dir: {}", e))?;
            let nvm_sh = Path::new(&home).join(".nvm").join("nvm.sh");
            if !nvm_sh.exists() {
                return Err("NVM tidak terinstal pada sistem ini.".to_string());
            }

            let output = std::process::Command::new("bash")
                .args(&["-c", &format!("source {} && nvm install {}", nvm_sh.to_string_lossy(), ver_to_install)])
                .output()
                .map_err(|e| format!("Gagal menjalankan nvm install: {}", e))?;

            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);

            if output.status.success() {
                Ok(format!("Node.js versi {} berhasil diinstal.", ver_to_install))
            } else {
                Err(format!(
                    "Gagal menginstal Node.js versi {}. Log: {} {}",
                    ver_to_install,
                    stdout.trim(),
                    stderr.trim()
                ))
            }
        })
        .await
        .map_err(|e| format!("Proses instalasi Node.js gagal: {}", e))?
    }

    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    {
        let _ = ver_to_install;
        Err("Sistem operasi tidak didukung untuk nvm install.".to_string())
    }
}

#[tauri::command]
pub async fn install_nvm() -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        // 1. Download nvm-setup.zip (dengan fallback mirror jika diperlukan)
        let primary_url = "https://github.com/coreybutler/nvm-windows/releases/download/1.1.12/nvm-setup.zip";
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(120))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());

        let response = client.get(primary_url).send().await
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

        // 2. Extract ZIP
        crate::commands::downloader::extract_zip(&zip_path, &temp_dir)?;

        // 3. Jalankan nvm-setup.exe dengan elevasi Administrator (UAC RunAs)
        let setup_exe = temp_dir.join("nvm-setup.exe");
        if !setup_exe.exists() {
            return Err("File nvm-setup.exe tidak ditemukan di dalam paket ZIP.".to_string());
        }

        let setup_str = setup_exe.to_string_lossy().to_string();
        let ps_cmd = format!(
            "Start-Process -FilePath '{}' -ArgumentList '/VERYSILENT /SUPPRESSMSGBOXES /NORESTART' -Verb RunAs -Wait",
            setup_str
        );

        let output = crate::create_hidden_command("powershell.exe")
            .args(&["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", &ps_cmd])
            .output()
            .map_err(|e| format!("Gagal menjalankan instalasi NVM: {}", e))?;

        // Cleanup files
        let _ = fs::remove_file(&zip_path);
        let _ = fs::remove_file(&setup_exe);

        if output.status.success() {
            // Update PATH proses Envku saat ini secara in-memory agar langsung terdeteksi
            if let Ok(profile) = std::env::var("USERPROFILE") {
                let nvm_appdata = Path::new(&profile).join("AppData\\Roaming\\nvm");
                let nodejs_symlink = Path::new("C:\\Program Files\\nodejs");
                if let Ok(curr_path) = std::env::var("PATH") {
                    let updated = format!("{};{};{}", nvm_appdata.display(), nodejs_symlink.display(), curr_path);
                    std::env::set_var("PATH", updated);
                }
                std::env::set_var("NVM_HOME", nvm_appdata.to_string_lossy().to_string());
                std::env::set_var("NVM_SYMLINK", nodejs_symlink.to_string_lossy().to_string());
            }

            // Broadcast environment update ke seluruh sistem
            let _ = crate::create_hidden_command("powershell.exe")
                .args(&[
                    "-NoProfile",
                    "-Command",
                    "$signature = @'\n[DllImport(\"user32.dll\", SetLastError = true, CharSet = CharSet.Auto)]\npublic static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint Msg, IntPtr wParam, string lParam, uint fuFlags, uint uTimeout, out IntPtr lpdwResult);\n'@\n$type = Add-Type -MemberDefinition $signature -Name \"Win32\" -Namespace \"Env\" -PassThru\n$type::SendMessageTimeout(0xffff, 0x001A, 0, \"Environment\", 2, 2000, [ref][IntPtr]::Zero) | Out-Null"
                ])
                .output();

            Ok("NVM (Node Version Manager) berhasil terpasang di komputer Anda dan siap digunakan.".to_string())
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
                chars.next();
            }
            continue;
        }
        
        if in_escape {
            if c >= '@' && c <= '~' {
                in_escape = false;
            }
            continue;
        }
        
        result.push(c);
    }
    result
}
