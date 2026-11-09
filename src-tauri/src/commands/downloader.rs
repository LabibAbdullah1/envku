use crate::config::get_server_dir_path;
use futures_util::StreamExt;
use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter};
use zip::ZipArchive;

#[derive(Clone, serde::Serialize)]
pub struct DownloadProgressPayload {
    pub component_id: String,
    pub percentage: u32,
    pub bytes_downloaded: u64,
    pub bytes_total: u64,
}

pub struct ComponentUrls<'a> {
    pub primary: &'a str,
    pub fallback: &'a str,
}

// Helper to resolve component zip urls (Subdomain Mirror + Upstream Fallback)
fn get_component_urls(component_id: &str) -> Result<ComponentUrls<'static>, String> {
    match component_id {
        "apache" => Ok(ComponentUrls {
            primary: "https://envku.subly.my.id/packages/win/apache2.4.zip",
            fallback: "https://www.apachelounge.com/download/VS18/binaries/httpd-2.4.68-260617-Win64-VS18.zip",
        }),
        "php85" => Ok(ComponentUrls {
            primary: "https://envku.subly.my.id/packages/win/php8.5.zip",
            fallback: "https://windows.php.net/downloads/releases/php-8.5.10-Win32-vs17-x64.zip",
        }),
        "php84" => Ok(ComponentUrls {
            primary: "https://envku.subly.my.id/packages/win/php8.4.zip",
            fallback: "https://windows.php.net/downloads/releases/php-8.4.25-Win32-vs17-x64.zip",
        }),
        "php83" => Ok(ComponentUrls {
            primary: "https://envku.subly.my.id/packages/win/php8.3.zip",
            fallback: "https://windows.php.net/downloads/releases/php-8.3.33-Win32-vs16-x64.zip",
        }),
        "php82" => Ok(ComponentUrls {
            primary: "https://envku.subly.my.id/packages/win/php8.2.zip",
            fallback: "https://windows.php.net/downloads/releases/php-8.2.33-Win32-vs16-x64.zip",
        }),
        "mysql" => Ok(ComponentUrls {
            primary: "https://envku.subly.my.id/packages/win/mysql8.0.zip",
            fallback: "https://cdn.mysql.com/archives/mysql-8.0/mysql-8.0.39-winx64.zip",
        }),
        "phpmyadmin" => Ok(ComponentUrls {
            primary: "https://envku.subly.my.id/packages/common/phpmyadmin.zip",
            fallback: "https://files.phpmyadmin.net/phpMyAdmin/5.2.3/phpMyAdmin-5.2.3-all-languages.zip",
        }),
        "composer" => Ok(ComponentUrls {
            primary: "https://getcomposer.org/download/latest-stable/composer.phar",
            fallback: "https://getcomposer.org/composer.phar",
        }),
        "redis" => Ok(ComponentUrls {
            primary: "https://envku.subly.my.id/packages/win/redis.zip",
            fallback: "https://github.com/tporadowski/redis/releases/download/v5.0.14.1/Redis-x64-5.0.14.1.zip",
        }),
        "mailpit" => Ok(ComponentUrls {
            primary: "https://envku.subly.my.id/packages/win/mailpit.zip",
            fallback: "https://github.com/axllent/mailpit/releases/download/v1.21.8/mailpit-windows-amd64.zip",
        }),
        _ => Err(format!("ID komponen tidak dikenal: {}", component_id)),
    }
}

#[cfg(target_os = "linux")]
fn get_linux_component_urls(component_id: &str) -> Result<ComponentUrls<'static>, String> {
    match component_id {
        "mailpit" => Ok(ComponentUrls {
            primary: "https://envku.subly.my.id/packages/linux/mailpit.tar.gz",
            fallback: "https://github.com/axllent/mailpit/releases/download/v1.21.8/mailpit-linux-amd64.tar.gz",
        }),
        "phpmyadmin" => Ok(ComponentUrls {
            primary: "https://envku.subly.my.id/packages/common/phpmyadmin.zip",
            fallback: "https://files.phpmyadmin.net/phpMyAdmin/5.2.3/phpMyAdmin-5.2.3-all-languages.zip",
        }),
        "composer" => Ok(ComponentUrls {
            primary: "https://getcomposer.org/download/latest-stable/composer.phar",
            fallback: "https://getcomposer.org/composer.phar",
        }),
        _ => Err(format!("ID komponen Linux tidak dikenal untuk download langsung: {}", component_id)),
    }
}

fn is_archive_complete_and_valid(path: &Path, is_zip: bool) -> bool {
    if !path.exists() {
        return false;
    }
    if let Ok(meta) = fs::metadata(path) {
        if meta.len() < 1000 {
            return false;
        }
        if is_zip {
            if let Ok(file) = File::open(path) {
                return ZipArchive::new(file).is_ok();
            }
            return false;
        } else {
            return meta.len() > 100_000;
        }
    }
    false
}

pub async fn download_file_with_resume(
    app: &AppHandle,
    component_id: &str,
    primary_url: &str,
    fallback_url: &str,
    final_file_path: &Path,
    progress_scale: Option<(u32, u32)>,
) -> Result<(), String> {
    let is_zip = final_file_path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("zip"))
        .unwrap_or(false);

    // 1. Jika file final sudah ada dan valid 100%, lewati pengunduhan langsung!
    if is_archive_complete_and_valid(final_file_path, is_zip) {
        let total_size = fs::metadata(final_file_path).map(|m| m.len()).unwrap_or(1);
        let final_pct = match progress_scale {
            Some((start, span)) => start + span,
            None => 100,
        };
        let _ = app.emit(
            "download_progress",
            DownloadProgressPayload {
                component_id: component_id.to_string(),
                percentage: final_pct.min(100),
                bytes_downloaded: total_size,
                bytes_total: total_size,
            },
        );
        return Ok(());
    }

    if let Some(parent) = final_file_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Gagal membuat folder sementara: {}", e))?;
    }

    let part_file_path = PathBuf::from(format!("{}.part", final_file_path.to_string_lossy()));

    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36")
        .connect_timeout(std::time::Duration::from_secs(15))
        .timeout(std::time::Duration::from_secs(180))
        .tcp_keepalive(Some(std::time::Duration::from_secs(15)))
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new());

    const MAX_RETRIES: u32 = 6;
    let mut current_attempt: u32 = 0;
    let mut last_error: String = String::new();

    while current_attempt < MAX_RETRIES {
        current_attempt += 1;

        // Rotasi mirror: percobaan 1-3 pakai primary, berikutnya pakai fallback
        let url = if current_attempt <= 3 {
            primary_url
        } else {
            fallback_url
        };

        let existing_bytes = if part_file_path.exists() {
            fs::metadata(&part_file_path).map(|m| m.len()).unwrap_or(0)
        } else {
            0
        };

        let mut req = client.get(url);
        if existing_bytes > 0 {
            req = req.header("Range", format!("bytes={}-", existing_bytes));
        }

        let response = match req.send().await {
            Ok(res) => res,
            Err(e) => {
                last_error = format!("Gagal menghubungi server unduhan: {} (percobaan {}/{})", e, current_attempt, MAX_RETRIES);
                let backoff_ms = 1000 * current_attempt as u64;
                tokio::time::sleep(std::time::Duration::from_millis(backoff_ms)).await;
                continue;
            }
        };

        let status = response.status();

        // 416 Range Not Satisfiable: file di disk mungkin sudah lengkap
        if status == reqwest::StatusCode::RANGE_NOT_SATISFIABLE {
            if is_archive_complete_and_valid(&part_file_path, is_zip) {
                if final_file_path.exists() {
                    let _ = fs::remove_file(final_file_path);
                }
                let _ = fs::rename(&part_file_path, final_file_path);
                return Ok(());
            } else {
                let _ = fs::remove_file(&part_file_path);
                continue;
            }
        }

        let (mut file, total_size, mut downloaded) = if status == reqwest::StatusCode::PARTIAL_CONTENT {
            let content_len = response.content_length().unwrap_or(0);
            let total = existing_bytes + content_len;
            let file = match OpenOptions::new().create(true).append(true).open(&part_file_path) {
                Ok(f) => f,
                Err(e) => {
                    last_error = format!("Gagal membuka file sementara untuk melanjutkan unduhan: {}", e);
                    tokio::time::sleep(std::time::Duration::from_millis(1000)).await;
                    continue;
                }
            };
            (file, total, existing_bytes)
        } else if status.is_success() {
            let total = response.content_length().unwrap_or(0);
            let file = match File::create(&part_file_path) {
                Ok(f) => f,
                Err(e) => {
                    last_error = format!("Gagal membuat file sementara: {}", e);
                    tokio::time::sleep(std::time::Duration::from_millis(1000)).await;
                    continue;
                }
            };
            (file, total, 0)
        } else {
            last_error = format!("Server mengembalikan status HTTP {} (percobaan {}/{})", status, current_attempt, MAX_RETRIES);
            let backoff_ms = 1000 * current_attempt as u64;
            tokio::time::sleep(std::time::Duration::from_millis(backoff_ms)).await;
            continue;
        };

        // Pancarkan persentase awal saat tersambung / melanjutkan
        if total_size > 0 {
            let raw_pct = ((downloaded as f64 / total_size as f64) * 100.0) as u32;
            let final_pct = match progress_scale {
                Some((start, span)) => start + ((raw_pct * span) / 100),
                None => raw_pct,
            };
            let _ = app.emit(
                "download_progress",
                DownloadProgressPayload {
                    component_id: component_id.to_string(),
                    percentage: final_pct.min(100),
                    bytes_downloaded: downloaded,
                    bytes_total: total_size,
                },
            );
        }

        let mut stream = response.bytes_stream();
        let mut stream_error = false;
        let mut last_emit = std::time::Instant::now();

        while let Some(chunk_res) = stream.next().await {
            match chunk_res {
                Ok(chunk) => {
                    if let Err(e) = file.write_all(&chunk) {
                        last_error = format!("Gagal menulis data ke disk: {}", e);
                        stream_error = true;
                        break;
                    }
                    downloaded += chunk.len() as u64;

                    if total_size > 0 && (last_emit.elapsed().as_millis() >= 80 || downloaded >= total_size) {
                        let raw_pct = ((downloaded as f64 / total_size as f64) * 100.0) as u32;
                        let final_pct = match progress_scale {
                            Some((start, span)) => start + ((raw_pct * span) / 100),
                            None => raw_pct,
                        };
                        let _ = app.emit(
                            "download_progress",
                            DownloadProgressPayload {
                                component_id: component_id.to_string(),
                                percentage: final_pct.min(100),
                                bytes_downloaded: downloaded,
                                bytes_total: total_size,
                            },
                        );
                        last_emit = std::time::Instant::now();
                    }
                }
                Err(e) => {
                    last_error = format!("Koneksi terputus saat streaming unduhan: {}. Melanjutkan otomatis...", e);
                    stream_error = true;
                    break;
                }
            }
        }

        let _ = file.flush();
        drop(file);

        if stream_error {
            // Byte yang sudah terunduh aman di .part! Lanjutkan di percobaan berikutnya dengan Range
            let backoff_ms = 1200 * current_attempt as u64;
            tokio::time::sleep(std::time::Duration::from_millis(backoff_ms)).await;
            continue;
        }

        // Pengunduhan selesai sukses!
        if final_file_path.exists() {
            let _ = fs::remove_file(final_file_path);
        }
        if let Err(e) = fs::rename(&part_file_path, final_file_path) {
            return Err(format!("Gagal menyelesaikan file unduhan: {}", e));
        }

        let final_pct = match progress_scale {
            Some((start, span)) => start + span,
            None => 100,
        };
        let _ = app.emit(
            "download_progress",
            DownloadProgressPayload {
                component_id: component_id.to_string(),
                percentage: final_pct.min(100),
                bytes_downloaded: downloaded,
                bytes_total: total_size.max(downloaded),
            },
        );

        return Ok(());
    }

    Err(format!(
        "Pengunduhan komponen '{}' gagal setelah {} kali percobaan. Alasan terakhir: {}. Silakan periksa koneksi internet Anda.",
        component_id, MAX_RETRIES, last_error
    ))
}

// Safe ZIP file extraction helper
pub fn extract_zip(zip_path: &Path, target_dir: &Path) -> Result<(), String> {
    let file = File::open(zip_path).map_err(|e| format!("Gagal membuka file ZIP: {}", e))?;
    let mut archive =
        ZipArchive::new(file).map_err(|e| format!("Gagal memproses file ZIP: {}", e))?;

    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| format!("Gagal membaca index file ZIP: {}", e))?;
        let outpath = match file.enclosed_name() {
            Some(path) => target_dir.join(path),
            None => continue,
        };

        if file.name().ends_with('/') {
            fs::create_dir_all(&outpath)
                .map_err(|e| format!("Gagal membuat direktori zip: {}", e))?;
        } else {
            if let Some(p) = outpath.parent() {
                if !p.exists() {
                    fs::create_dir_all(p)
                        .map_err(|e| format!("Gagal membuat sub-direktori zip: {}", e))?;
                }
            }
            if outpath.exists() {
                if let Ok(meta) = fs::metadata(&outpath) {
                    let mut perms = meta.permissions();
                    if perms.readonly() {
                        perms.set_readonly(false);
                        let _ = fs::set_permissions(&outpath, perms);
                    }
                }
            }
            let mut outfile =
                match File::create(&outpath) {
                    Ok(f) => f,
                    Err(e) => {
                        std::thread::sleep(std::time::Duration::from_millis(250));
                        File::create(&outpath).map_err(|e2| {
                            format!("Gagal membuat file output {}: {} (retry: {})", outpath.display(), e, e2)
                        })?
                    }
                };
            std::io::copy(&mut file, &mut outfile)
                .map_err(|e| format!("Gagal menyalin data zip: {}", e))?;
        }
    }
    Ok(())
}

#[tauri::command]
#[allow(unreachable_code)]
pub async fn download_and_extract(app: AppHandle, component_id: String) -> Result<String, String> {
    #[cfg(target_os = "linux")]
    {
        return download_and_extract_linux(app, component_id).await;
    }

    let urls = get_component_urls(&component_id)?;
    let is_zip = component_id != "composer";
    let download_filename = if is_zip {
        format!("{}.zip", component_id)
    } else {
        "composer.phar".to_string()
    };

    let server_dir = get_server_dir_path();
    let temp_dir = server_dir.join("temp");
    fs::create_dir_all(&temp_dir).map_err(|e| format!("Gagal membuat folder temp: {}", e))?;

    let file_path = temp_dir.join(&download_filename);
    download_file_with_resume(&app, &component_id, urls.primary, urls.fallback, &file_path, None).await?;

    // Stop services & forcefully terminate any lingering processes to release file locks
    #[cfg(target_os = "windows")]
    {
        if component_id == "apache" || component_id == "php85" || component_id == "php84" || component_id == "php83" || component_id == "php82" {
            let _ = crate::commands::services::control_service("Apache2.4".to_string(), "stop".to_string());
            let _ = crate::create_hidden_command("taskkill").args(&["/F", "/IM", "httpd.exe"]).output();
            let _ = crate::create_hidden_command("taskkill").args(&["/F", "/IM", "php-cgi.exe"]).output();
            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        }

        if component_id == "mysql" {
            let _ = crate::commands::services::control_service("mysql-server".to_string(), "stop".to_string());
            let _ = crate::create_hidden_command("taskkill").args(&["/F", "/IM", "mysqld.exe"]).output();
            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        }

        if component_id == "redis" {
            let _ = crate::commands::services::control_service("redis-server".to_string(), "stop".to_string());
            let _ = crate::create_hidden_command("taskkill").args(&["/F", "/IM", "redis-server.exe"]).output();
            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        }

        if component_id == "mailpit" {
            let _ = crate::commands::services::control_service("mailpit".to_string(), "stop".to_string());
            let _ = crate::create_hidden_command("taskkill").args(&["/F", "/IM", "mailpit.exe"]).output();
            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        }
    }
    #[cfg(target_os = "linux")]
    {
        if component_id == "apache" || component_id == "php85" || component_id == "php84" || component_id == "php83" || component_id == "php82" {
            let _ = crate::commands::services::control_service("apache".to_string(), "stop".to_string());
        }

        if component_id == "mysql" {
            let _ = crate::commands::services::control_service("mysql".to_string(), "stop".to_string());
        }

        if component_id == "redis" {
            let _ = crate::commands::services::control_service("redis".to_string(), "stop".to_string());
        }
    }

    if is_zip {
        // Extraction target directories
        let extract_dest = match component_id.as_str() {
            "php85" => server_dir.join("php85"),
            "php84" => server_dir.join("php84"),
            "php83" => server_dir.join("php83"),
            "php82" => server_dir.join("php82"),
            "phpmyadmin" => server_dir.join("www"), // Extracts directly into www
            "redis" => server_dir.join("redis"),
            "mailpit" => server_dir.join("mailpit"),
            _ => server_dir.to_path_buf(), // Apache and MySQL go to base C:\server
        };

        fs::create_dir_all(&extract_dest)
            .map_err(|e| format!("Gagal membuat folder tujuan: {}", e))?;

        let zip_file_clone = file_path.clone();
        let dest_clone = extract_dest.clone();
        tokio::task::spawn_blocking(move || {
            extract_zip(&zip_file_clone, &dest_clone)
        })
        .await
        .map_err(|e| format!("Eksekusi ekstraksi gagal dijadwalkan: {}", e))??;

        // Post-extraction: restructuring directories
        match component_id.as_str() {
            "apache" => {
                let httpd_conf_path = server_dir.join("Apache24\\conf\\httpd.conf");
                if httpd_conf_path.exists() {
                    let mut content = fs::read_to_string(&httpd_conf_path)
                        .map_err(|e| format!("Gagal membaca httpd.conf: {}", e))?;

                    let server_dir_slash = server_dir.to_string_lossy().replace('\\', "/");
                    content = content.replace(
                        "Define SRVROOT \"c:/Apache24\"",
                        &format!("Define SRVROOT \"{}/Apache24\"", server_dir_slash),
                    );
                    content = content.replace(
                        "Define SRVROOT \"C:/Apache24\"",
                        &format!("Define SRVROOT \"{}/Apache24\"", server_dir_slash),
                    );

                    // Enable rewrite module
                    content = content.replace(
                        "#LoadModule rewrite_module modules/mod_rewrite.so",
                        "LoadModule rewrite_module modules/mod_rewrite.so",
                    );
                    content = content.replace(
                        "# LoadModule rewrite_module modules/mod_rewrite.so",
                        "LoadModule rewrite_module modules/mod_rewrite.so",
                    );

                    // Enable proxy modules
                    content = content.replace(
                        "#LoadModule proxy_module modules/mod_proxy.so",
                        "LoadModule proxy_module modules/mod_proxy.so",
                    );
                    content = content.replace(
                        "# LoadModule proxy_module modules/mod_proxy.so",
                        "LoadModule proxy_module modules/mod_proxy.so",
                    );
                    content = content.replace(
                        "#LoadModule proxy_http_module modules/mod_proxy_http.so",
                        "LoadModule proxy_http_module modules/mod_proxy_http.so",
                    );
                    content = content.replace(
                        "# LoadModule proxy_http_module modules/mod_proxy_http.so",
                        "LoadModule proxy_http_module modules/mod_proxy_http.so",
                    );

                    // Enable SSL modules
                    content = content.replace(
                        "#LoadModule ssl_module modules/mod_ssl.so",
                        "LoadModule ssl_module modules/mod_ssl.so",
                    );
                    content = content.replace(
                        "# LoadModule ssl_module modules/mod_ssl.so",
                        "LoadModule ssl_module modules/mod_ssl.so",
                    );
                    content = content.replace(
                        "#LoadModule socache_shmcb_module modules/mod_socache_shmcb.so",
                        "LoadModule socache_shmcb_module modules/mod_socache_shmcb.so",
                    );
                    content = content.replace(
                        "# LoadModule socache_shmcb_module modules/mod_socache_shmcb.so",
                        "LoadModule socache_shmcb_module modules/mod_socache_shmcb.so",
                    );

                    // Enable port 443 listening
                    if !content.contains("Listen 443") {
                        content = content.replace("Listen 80", "Listen 80\nListen 443");
                    }

                    // Set ServerName to localhost:80 to suppress FQDN warning
                    content = content.replace("#ServerName www.example.com:80", "ServerName localhost:80");

                    // Enable vhosts config file inclusion
                    content = content.replace(
                        "#Include conf/extra/httpd-vhosts.conf",
                        "Include conf/extra/httpd-vhosts.conf",
                    );

                    // Set index.php as default DirectoryIndex
                    content = content.replace(
                        "DirectoryIndex index.html",
                        "DirectoryIndex index.php index.html",
                    );

                    // Add phpMyAdmin global alias if not present
                    if !content.contains("Alias /phpmyadmin") {
                        let pma_alias = format!(
                            "\n# phpMyAdmin Global Alias\nAlias /phpmyadmin \"{}/www/phpmyadmin\"\n<Directory \"{}/www/phpmyadmin\">\n    Options Indexes FollowSymLinks\n    AllowOverride All\n    Require all granted\n</Directory>\n",
                            server_dir_slash, server_dir_slash
                        );
                        content.push_str(&pma_alias);
                    }

                    fs::write(&httpd_conf_path, content).map_err(|e| {
                        format!("Gagal memperbarui httpd.conf setelah ekstraksi: {}", e)
                    })?;

                    let vhosts_path = server_dir.join("Apache24").join("conf").join("extra").join("httpd-vhosts.conf");
                    crate::commands::projects::clean_dummy_vhosts_file(&vhosts_path);

                    let extra_dir = server_dir.join("Apache24").join("conf").join("extra");
                    let _ = fs::create_dir_all(&extra_dir);
                    let php_conf_file = extra_dir.join("httpd-php.conf");
                    if !php_conf_file.exists() {
                        let _ = fs::write(&php_conf_file, "# Envku Modular PHP Configuration\n# Diperbarui secara otomatis saat memilih versi PHP di PHP Switcher\n");
                    }
                    let all_php = vec!["php85", "php84", "php83", "php82"];
                    for php_ver in all_php {
                        if server_dir.join(php_ver).exists() {
                            let _ = crate::commands::php::switch_php_version(php_ver.to_string());
                            break;
                        }
                    }
                }
            }
            "mysql" => {
                let entries = fs::read_dir(&server_dir)
                    .map_err(|e| format!("Gagal membaca direktori server: {}", e))?;
                let mut mysql_folder = None;
                for entry in entries {
                    if let Ok(entry) = entry {
                        let name = entry.file_name().to_string_lossy().into_owned();
                        if name.starts_with("mysql-") && entry.path().is_dir() {
                            mysql_folder = Some(entry.path());
                            break;
                        }
                    }
                }
                if let Some(folder) = mysql_folder {
                    let dest = server_dir.join("mysql");
                    if dest.exists() {
                        fs::remove_dir_all(&dest).unwrap_or(());
                    }
                    fs::rename(folder, &dest)
                        .map_err(|e| format!("Gagal merestrukturasi folder MySQL: {}", e))?;

                    // Automatically generate my.ini after extraction
                    let my_ini_path = dest.join("my.ini");
                    let server_dir_slash = server_dir.to_string_lossy().replace('\\', "/");
                    let config = format!(
                        r#"[mysqld]
basedir={}/mysql
datadir={}/mysql/data
port=3306
character-set-server=utf8mb4
default-storage-engine=INNODB
sql_mode=NO_ENGINE_SUBSTITUTION
default_authentication_plugin=mysql_native_password
"#,
                        server_dir_slash, server_dir_slash
                    );
                    let _ = fs::write(&my_ini_path, config);

                    // Automatically initialize datadir if it does not exist
                    let data_dir = dest.join("data");
                    if !data_dir.exists() {
                        let mysqld_path = dest.join("bin").join("mysqld.exe");
                    let _ = crate::create_hidden_command(&mysqld_path.to_string_lossy())
                            .args(&["--initialize-insecure", "--user=mysql"])
                            .output();
                    }
                }
            }
            "phpmyadmin" => {
                let www_dir = server_dir.join("www");
                let entries = fs::read_dir(&www_dir)
                    .map_err(|e| format!("Gagal membaca direktori www: {}", e))?;
                let mut pma_folder = None;
                for entry in entries {
                    if let Ok(entry) = entry {
                        let name = entry.file_name().to_string_lossy().into_owned();
                        if name.starts_with("phpMyAdmin-") && entry.path().is_dir() {
                            pma_folder = Some(entry.path());
                            break;
                        }
                    }
                }
                if let Some(folder) = pma_folder {
                    let dest = www_dir.join("phpmyadmin");
                    if dest.exists() {
                        fs::remove_dir_all(&dest).unwrap_or(());
                    }
                    fs::rename(folder, &dest)
                        .map_err(|e| format!("Gagal merestrukturasi folder phpMyAdmin: {}", e))?;

                    // Automatically create config.inc.php with AllowNoPassword enabled
                    let config_path = dest.join("config.inc.php");
                    let pma_config = r#"<?php
// Suppress PHP 8.4+ deprecation warnings to preserve header and session integrity
@ini_set('display_errors', '0');
error_reporting(E_ALL & ~E_DEPRECATED & ~E_STRICT & ~E_NOTICE);

$cfg['blowfish_secret'] = 'envku_orchestrator_secret_32_cha';
$i = 0;
$i++;
$cfg['Servers'][$i]['auth_type'] = 'cookie';
$cfg['Servers'][$i]['host'] = '127.0.0.1';
$cfg['Servers'][$i]['compress'] = false;
$cfg['Servers'][$i]['AllowNoPassword'] = true;
$cfg['UploadDir'] = '';
$cfg['SaveDir'] = '';

// phpMyAdmin configuration storage settings
$cfg['Servers'][$i]['pmadb'] = 'phpmyadmin';
$cfg['Servers'][$i]['bookmarktable'] = 'pma__bookmark';
$cfg['Servers'][$i]['relation'] = 'pma__relation';
$cfg['Servers'][$i]['table_info'] = 'pma__table_info';
$cfg['Servers'][$i]['table_coords'] = 'pma__table_coords';
$cfg['Servers'][$i]['pdf_pages'] = 'pma__pdf_pages';
$cfg['Servers'][$i]['schema_graphs'] = 'pma__schema_graphs';
$cfg['Servers'][$i]['displaywidth'] = 'pma__displaywidth';
$cfg['Servers'][$i]['tracking'] = 'pma__tracking';
$cfg['Servers'][$i]['userconfig'] = 'pma__userconfig';
$cfg['Servers'][$i]['recent'] = 'pma__recent';
$cfg['Servers'][$i]['favorite'] = 'pma__favorite';
$cfg['Servers'][$i]['users'] = 'pma__users';
$cfg['Servers'][$i]['usergroups'] = 'pma__usergroups';
$cfg['Servers'][$i]['navigationhiding'] = 'pma__navigationhiding';
$cfg['Servers'][$i]['savedsearches'] = 'pma__savedsearches';
$cfg['Servers'][$i]['central_columns'] = 'pma__central_columns';
$cfg['Servers'][$i]['designer_settings'] = 'pma__designer_settings';
$cfg['Servers'][$i]['export_templates'] = 'pma__export_templates';
"#;
                    let _ = fs::write(config_path, pma_config);
                }
            }
            "php85" | "php84" | "php83" | "php82" => {
                let php_dir = server_dir.join(&component_id);

                // Flatten single inner directory if present in zip
                if let Ok(entries) = fs::read_dir(&php_dir) {
                    let valid_entries: Vec<_> = entries.flatten().collect();
                    if valid_entries.len() == 1 && valid_entries[0].path().is_dir() {
                        let subfolder = valid_entries[0].path();
                        if let Ok(sub_entries) = fs::read_dir(&subfolder) {
                            for sub_entry in sub_entries.flatten() {
                                let target_file = php_dir.join(sub_entry.file_name());
                                let _ = fs::rename(sub_entry.path(), target_file);
                            }
                        }
                        let _ = fs::remove_dir_all(&subfolder);
                    }
                }

                // Konfigurasi php.ini otomatis dengan path absolut & kompatibilitas phpMyAdmin
                let _ = crate::commands::php::configure_php_ini_for_version(&server_dir, &component_id);
            }
            _ => {}
        }
    } else {
        // Composer logic
        let composer_dir = server_dir.join("composer");
        fs::create_dir_all(&composer_dir)
            .map_err(|e| format!("Gagal membuat folder composer: {}", e))?;

        let dest_phar = composer_dir.join("composer.phar");
        fs::rename(&file_path, &dest_phar)
            .map_err(|e| format!("Gagal memindahkan composer.phar: {}", e))?;

        // Write composer.bat
        let bat_path = composer_dir.join("composer.bat");
        let bat_content = "@php \"%~dp0composer.phar\" %*\r\n";
        fs::write(&bat_path, bat_content)
            .map_err(|e| format!("Gagal menulis composer.bat: {}", e))?;
    }

    // Cleanup Zip, Part file & Temp dir
    let _ = fs::remove_file(&file_path);
    let part_path = PathBuf::from(format!("{}.part", file_path.to_string_lossy()));
    let _ = fs::remove_file(&part_path);
    let _ = fs::remove_dir(&temp_dir); // Only succeeds if empty

    // Re-register phpmyadmin virtual host if needed
    let pma_path = server_dir.join("www").join("phpmyadmin");
    let _ = crate::commands::projects::add_project(
        "phpmyadmin.test".to_string(),
        pma_path.to_string_lossy().to_string(),
        false,
        None,
        false,
    );

    // Automatically register newly downloaded paths to system PATH
    let _ = crate::platform::env_path::register_system_paths();

    if component_id == "php85" || component_id == "php84" || component_id == "php83" || component_id == "php82" {
        let active = crate::commands::php::get_active_php_version().unwrap_or_default();
        if active == "unknown" || active.is_empty() {
            let _ = crate::commands::php::switch_php_version(component_id.clone());
        }
    }

    Ok(format!(
        "Komponen {} berhasil di-download dan di-ekstrak.",
        component_id.to_uppercase()
    ))
}

#[cfg(target_os = "linux")]
fn emit_progress(app: &AppHandle, component_id: &str, percentage: u32) {
    app.emit(
        "download_progress",
        DownloadProgressPayload {
            component_id: component_id.to_string(),
            percentage,
            bytes_downloaded: percentage as u64,
            bytes_total: 100,
        },
    )
    .unwrap_or(());
}

#[cfg(target_os = "linux")]
async fn download_file_direct(app: &AppHandle, component_id: &str, primary_url: &str, fallback_url: &str, dest_path: &Path) -> Result<(), String> {
    download_file_with_resume(app, component_id, primary_url, fallback_url, dest_path, Some((10, 60))).await
}

#[cfg(target_os = "linux")]
fn run_pkexec_command(args: &[&str]) -> Result<(), String> {
    let output = crate::execute_elevated_command(args)
        .map_err(|e| format!("Gagal menjalankan perintah elevated {}: {}", args.join(" "), e))?;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        Err(format!(
            "Gagal menjalankan perintah elevated {}. Stderr: {}. Stdout: {}",
            args.join(" "), stderr.trim(), stdout.trim()
        ))
    }
}



#[cfg(target_os = "linux")]
async fn setup_php_repository() -> Result<(), String> {
    use std::fs;
    let os_release_content = fs::read_to_string("/etc/os-release").unwrap_or_default();
    let mut os_info = std::collections::HashMap::new();
    for line in os_release_content.lines() {
        let parts: Vec<&str> = line.splitn(2, '=').collect();
        if parts.len() == 2 {
            let key = parts[0].trim();
            let val = parts[1].trim().trim_matches('"').trim_matches('\'');
            os_info.insert(key.to_string(), val.to_string());
        }
    }

    let os_id = os_info.get("ID").map(|s| s.as_str()).unwrap_or("");
    let os_like = os_info.get("ID_LIKE").map(|s| s.as_str()).unwrap_or("");
    let is_debian = os_id == "debian" || (os_like.contains("debian") && !os_like.contains("ubuntu") && !os_id.contains("ubuntu"));

    if is_debian {
        let codename = os_info.get("VERSION_CODENAME")
            .map(|s| s.as_str())
            .unwrap_or("bookworm");

        // Add repository to sources.list.d
        let repo_entry = format!("deb [signed-by=/usr/share/keyrings/deb.sury.org-php.gpg] https://packages.sury.org/php/ {} main\n", codename);
        let temp_sources = std::env::temp_dir().join("sury-php.list");
        fs::write(&temp_sources, repo_entry)
            .map_err(|e| format!("Gagal menulis file list sementara: {}", e))?;

        let cmd_str = format!(
            "rm -f /etc/apt/sources.list.d/sury-php.list && \
             apt-get update && \
             apt-get install -y lsb-release ca-certificates apt-transport-https software-properties-common gnupg2 curl && \
             curl -sSLo /usr/share/keyrings/deb.sury.org-php.gpg https://packages.sury.org/php/apt.gpg && \
             cp {} /etc/apt/sources.list.d/sury-php.list && \
             apt-get update",
            temp_sources.to_string_lossy()
        );
        let run_res = run_pkexec_command(&["bash", "-c", &cmd_str]);
 fs::remove_file(temp_sources);
        run_res?;
    } else {
        // Dapatkan nama codename sistem
        let codename = os_info.get("VERSION_CODENAME")
            .map(|s| s.as_str())
            .or_else(|| os_info.get("UBUNTU_CODENAME").map(|s| s.as_str()))
            .unwrap_or("noble");

        // Periksa apakah Launchpad PPA memiliki folder rilis untuk codename ini secara asinkron
        let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36")
        .timeout(std::time::Duration::from_secs(600))
        .connect_timeout(std::time::Duration::from_secs(20))
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new());
        let mut selected_codename = codename.to_string();
        let check_url = format!("https://ppa.launchpadcontent.net/ondrej/php/ubuntu/dists/{}/Release", codename);

        let is_supported = if let Ok(res) = client.head(&check_url).send().await {
            res.status().is_success()
        } else {
            false
        };

        if !is_supported {
            // Urutan fallback dari terdekat ke terlama
            let fallbacks = vec!["plucky", "oracular", "noble", "jammy"];
            for fb in fallbacks {
                let fb_url = format!("https://ppa.launchpadcontent.net/ondrej/php/ubuntu/dists/{}/Release", fb);
                if let Ok(res) = client.head(&fb_url).send().await {
                    if res.status().is_success() {
                        selected_codename = fb.to_string();
                        break;
                    }
                }
            }
        }

        let mut cmd_str = format!(
            "rm -f /etc/apt/sources.list.d/ondrej-*.list /etc/apt/sources.list.d/ondrej-*.sources && \
             apt-get install -y software-properties-common && \
             add-apt-repository -y ppa:ondrej/php"
        );
        if selected_codename != codename {
            cmd_str.push_str(&format!(
                " && sed -i -E 's/{0}/{1}/g' /etc/apt/sources.list.d/ondrej-*.sources /etc/apt/sources.list.d/ondrej-*.list 2>/dev/null || true",
                codename, selected_codename
            ));
        }
        cmd_str.push_str(" && apt-get update");
        run_pkexec_command(&["bash", "-c", &cmd_str])?;
    }

    Ok(())
}

#[cfg(target_os = "linux")]
async fn download_and_extract_linux(app: AppHandle, component_id: String) -> Result<String, String> {
    let server_dir = get_server_dir_path();
    let config_dir = server_dir.join("config");
    fs::create_dir_all(&config_dir).map_err(|e| format!("Gagal membuat folder config: {}", e))?;

    match component_id.as_str() {
        "apache" => {
            emit_progress(&app, &component_id, 10);
            let cmd_str = "apt-get update || true; apt-get install -o Dpkg::Options::=\"--force-confmiss\" --reinstall -y apache2 apache2-bin && a2enmod ssl && a2enmod proxy && a2enmod proxy_http && a2enmod rewrite && a2enmod headers";
            run_pkexec_command(&["sh", "-c", cmd_str])?;
            emit_progress(&app, &component_id, 80);

            // Create default apache2.conf for Envku if it doesn't exist
            let conf_path = config_dir.join("apache2.conf");
            if !conf_path.exists() {
                let default_conf = r#"ServerRoot "/etc/apache2"
DefaultRuntimeDir ${APACHE_RUN_DIR}
PidFile ${APACHE_PID_FILE}
Timeout 300
KeepAlive On
MaxKeepAliveRequests 100
KeepAliveTimeout 5
User ${APACHE_RUN_USER}
Group ${APACHE_RUN_GROUP}
HostnameLookups Off
ErrorLog ${APACHE_LOG_DIR}/error.log
LogLevel warn

IncludeOptional mods-enabled/*.load
IncludeOptional mods-enabled/*.conf

Include ports.conf

<Directory />
    Options FollowSymLinks
    AllowOverride None
    Require all denied
</Directory>

<Directory /opt/server/www/>
    AllowOverride All
    Require all granted
</Directory>

DocumentRoot "/opt/server/www"
AccessFileName .htaccess
TypesConfig /etc/mime.types

# Include Envku virtual hosts
IncludeOptional /opt/server/Apache24/conf/extra/httpd-vhosts.conf
"#;
                fs::write(&conf_path, default_conf).map_err(|e| format!("Gagal menulis apache2.conf: {}", e))?;
            }

            let vhosts_dir = server_dir.join("Apache24").join("conf").join("extra");
            fs::create_dir_all(&vhosts_dir).map_err(|e| format!("Gagal membuat folder vhosts: {}", e))?;
            let vhosts_file = vhosts_dir.join("httpd-vhosts.conf");
            if !vhosts_file.exists() {
                fs::write(&vhosts_file, "").unwrap_or(());
            }

            emit_progress(&app, &component_id, 100);
            Ok("Apache2 berhasil diinstal dan dikonfigurasi di Linux.".to_string())
        }
        "php85" | "php84" | "php83" | "php82" => {
            let php_version_dot = match component_id.as_str() {
                "php85" => "8.5",
                "php84" => "8.4",
                "php83" => "8.3",
                _ => "8.2",
            };
            emit_progress(&app, &component_id, 10);
            setup_php_repository().await?;
            emit_progress(&app, &component_id, 40);

            let pkgs = vec![
                format!("php{}", php_version_dot),
                format!("php{}-cli", php_version_dot),
                format!("php{}-common", php_version_dot),
                format!("php{}-mysql", php_version_dot),
                format!("php{}-curl", php_version_dot),
                format!("php{}-gd", php_version_dot),
                format!("php{}-mbstring", php_version_dot),
                format!("php{}-xml", php_version_dot),
                format!("php{}-zip", php_version_dot),
                format!("libapache2-mod-php{}", php_version_dot),
            ];
            let mut install_args = vec!["apt-get", "install", "-y"];
            for pkg in &pkgs {
                install_args.push(pkg);
            }
            run_pkexec_command(&install_args)?;

            // Pastikan modul PHP di-enable di Apache
            let enable_mod_cmd = format!("a2enmod php{} || true", php_version_dot);
     run_pkexec_command(&["sh", "-c", &enable_mod_cmd]);

            emit_progress(&app, &component_id, 80);

            let dest_php_dir = server_dir.join(&component_id).join("bin");
            fs::create_dir_all(&dest_php_dir).map_err(|e| format!("Gagal membuat folder PHP bin: {}", e))?;

            let system_php_bin = format!("/usr/bin/php{}", php_version_dot);
            let local_php_bin = dest_php_dir.join("php");
            if local_php_bin.exists() || local_php_bin.is_symlink() {
         fs::remove_file(&local_php_bin);
            }
            std::os::unix::fs::symlink(&system_php_bin, &local_php_bin)
                .map_err(|e| format!("Gagal membuat symlink PHP ke /usr/bin/php: {}", e))?;

            let local_ini = server_dir.join(&component_id).join("php.ini");
            if !local_ini.exists() {
                let sys_ini = format!("/etc/php/{}/cli/php.ini", php_version_dot);
                if Path::new(&sys_ini).exists() {
             fs::copy(&sys_ini, &local_ini);
                } else {
             fs::write(&local_ini, "; Empty php.ini for envku\n");
                }
            }

            emit_progress(&app, &component_id, 100);
            Ok(format!("PHP {} berhasil diinstal dan dikonfigurasi di Linux.", php_version_dot))
        }
        "mysql" => {
            emit_progress(&app, &component_id, 10);
            run_pkexec_command(&["sh", "-c", "apt-get update || true; apt-get install -y mysql-server"])?;

            // Konfigurasi otomatis: ubah otentikasi root agar bisa login tanpa password via phpMyAdmin
     run_pkexec_command(&["systemctl", "start", "mysql"]);
     run_pkexec_command(&[
                "mysql",
                "-u",
                "root",
                "-e",
                "ALTER USER 'root'@'localhost' IDENTIFIED BY ''; FLUSH PRIVILEGES;",
            ]);

            emit_progress(&app, &component_id, 80);

            let conf_path = config_dir.join("my.cnf");
            if !conf_path.exists() {
                let default_cnf = r#"[mysqld]
user=mysql
pid-file=/var/run/mysqld/mysqld.pid
socket=/var/run/mysqld/mysqld.sock
port=3306
basedir=/usr
datadir=/var/lib/mysql
tmpdir=/tmp
lc-messages-dir=/usr/share/mysql
bind-address=127.0.0.1
mysqlx-bind-address=127.0.0.1
"#;
                fs::write(&conf_path, default_cnf).map_err(|e| format!("Gagal menulis my.cnf: {}", e))?;
            }

            // Berikan izin akses agar user systemd 'mysql' bisa membaca config ini (termasuk folder induk /opt/server)
            let chmod_cmd = format!(
                "chmod 755 {} && chmod 755 {} && chmod 644 {}",
                server_dir.to_string_lossy(),
                config_dir.to_string_lossy(),
                conf_path.to_string_lossy()
            );
            run_pkexec_command(&["sh", "-c", &chmod_cmd])?;

            let dest_bin_dir = server_dir.join("mysql").join("bin");
            fs::create_dir_all(&dest_bin_dir).unwrap_or(());
            let local_mysql = dest_bin_dir.join("mysql");
            if local_mysql.exists() || local_mysql.is_symlink() {
         fs::remove_file(&local_mysql);
            }
     std::os::unix::fs::symlink("/usr/bin/mysql", &local_mysql);

            emit_progress(&app, &component_id, 100);
            Ok("MySQL Server berhasil diinstal di Linux.".to_string())
        }
        "redis" => {
            emit_progress(&app, &component_id, 10);
            run_pkexec_command(&["sh", "-c", "apt-get update || true; apt-get install -y redis-server"])?;
            emit_progress(&app, &component_id, 80);

            let conf_path = config_dir.join("redis.conf");
            if !conf_path.exists() {
                let default_redis_conf = r#"bind 127.0.0.1 ::1
port 6379
daemonize no
pidfile /var/run/redis/redis-server.pid
logfile ""
databases 16
save 900 1
save 300 10
save 60 10000
dir /var/lib/redis
"#;
                fs::write(&conf_path, default_redis_conf).map_err(|e| format!("Gagal menulis redis.conf: {}", e))?;
            }

            let dest_bin_dir = server_dir.join("redis");
            fs::create_dir_all(&dest_bin_dir).unwrap_or(());
            let local_redis_cli = dest_bin_dir.join("redis-cli");
            if local_redis_cli.exists() || local_redis_cli.is_symlink() {
         fs::remove_file(&local_redis_cli);
            }
     std::os::unix::fs::symlink("/usr/bin/redis-cli", &local_redis_cli);

            emit_progress(&app, &component_id, 100);
            Ok("Redis Server berhasil diinstal di Linux.".to_string())
        }
        "mailpit" => {
            emit_progress(&app, &component_id, 10);
            let urls = get_linux_component_urls(&component_id)?;
            let mailpit_dir = server_dir.join("mailpit");
            fs::create_dir_all(&mailpit_dir).map_err(|e| format!("Gagal membuat folder mailpit: {}", e))?;

            let temp_tar = server_dir.join("temp").join("mailpit.tar.gz");
            if let Some(parent) = temp_tar.parent() {
                fs::create_dir_all(parent).unwrap_or(());
            }

            download_file_direct(&app, &component_id, urls.primary, urls.fallback, &temp_tar).await?;
            emit_progress(&app, &component_id, 80);

            let output = std::process::Command::new("tar")
                .args(&["-xzf", &temp_tar.to_string_lossy(), "-C", &mailpit_dir.to_string_lossy()])
                .output()
                .map_err(|e| format!("Gagal menjalankan tar untuk ekstrak mailpit: {}", e))?;

     fs::remove_file(&temp_tar);

            if !output.status.success() {
                return Err("Gagal mengekstrak Mailpit tar.gz".to_string());
            }

            // Set executable permission for mailpit binary on Linux
            #[cfg(target_os = "linux")]
            {
                use std::os::unix::fs::PermissionsExt;
                let mailpit_bin = mailpit_dir.join("mailpit");
                if mailpit_bin.exists() {
                    let mut perms = fs::metadata(&mailpit_bin)
                        .map_err(|e| format!("Gagal membaca metadata biner Mailpit: {}", e))?
                        .permissions();
                    perms.set_mode(0o755);
                    fs::set_permissions(&mailpit_bin, perms)
                        .map_err(|e| format!("Gagal mengatur permission biner Mailpit: {}", e))?;
                }
            }

            // Auto register mailpit systemd service
     crate::platform::services::install_service("mailpit");

            emit_progress(&app, &component_id, 100);
            Ok("Mailpit berhasil diinstal di Linux.".to_string())
        }
        "phpmyadmin" => {
            emit_progress(&app, &component_id, 10);
            let urls = get_linux_component_urls(&component_id)?;
            let www_dir = server_dir.join("www");
            fs::create_dir_all(&www_dir).map_err(|e| format!("Gagal membuat folder www: {}", e))?;

            let temp_zip = server_dir.join("temp").join("phpmyadmin.zip");
            if let Some(parent) = temp_zip.parent() {
                fs::create_dir_all(parent).unwrap_or(());
            }

            download_file_direct(&app, &component_id, urls.primary, urls.fallback, &temp_zip).await?;
            emit_progress(&app, &component_id, 60);

            extract_zip(&temp_zip, &www_dir)?;
     fs::remove_file(&temp_zip);

            let entries = fs::read_dir(&www_dir).map_err(|e| format!("Gagal membaca www dir: {}", e))?;
            for entry in entries {
                if let Ok(entry) = entry {
                    let name = entry.file_name().to_string_lossy().into_owned();
                    if name.starts_with("phpMyAdmin-") && entry.path().is_dir() {
                        let dest = www_dir.join("phpmyadmin");
                        if dest.exists() {
                     fs::remove_dir_all(&dest);
                        }
                 fs::rename(entry.path(), &dest);

                        let config_path = dest.join("config.inc.php");
                        let pma_config = r#"<?php
// Suppress PHP 8.4+ deprecation warnings to preserve header and session integrity
@ini_set('display_errors', '0');
error_reporting(E_ALL & ~E_DEPRECATED & ~E_STRICT & ~E_NOTICE);

$cfg['blowfish_secret'] = 'envku_orchestrator_secret_32_cha';
$i = 0;
$i++;
$cfg['Servers'][$i]['auth_type'] = 'cookie';
$cfg['Servers'][$i]['host'] = '127.0.0.1';
$cfg['Servers'][$i]['compress'] = false;
$cfg['Servers'][$i]['AllowNoPassword'] = true;
$cfg['UploadDir'] = '';
$cfg['SaveDir'] = '';
$cfg['Servers'][$i]['pmadb'] = 'phpmyadmin';
$cfg['Servers'][$i]['bookmarktable'] = 'pma__bookmark';
$cfg['Servers'][$i]['relation'] = 'pma__relation';
$cfg['Servers'][$i]['table_info'] = 'pma__table_info';
$cfg['Servers'][$i]['table_coords'] = 'pma__table_coords';
$cfg['Servers'][$i]['pdf_pages'] = 'pma__pdf_pages';
$cfg['Servers'][$i]['schema_graphs'] = 'pma__schema_graphs';
$cfg['Servers'][$i]['displaywidth'] = 'pma__displaywidth';
$cfg['Servers'][$i]['tracking'] = 'pma__tracking';
$cfg['Servers'][$i]['userconfig'] = 'pma__userconfig';
$cfg['Servers'][$i]['recent'] = 'pma__recent';
$cfg['Servers'][$i]['favorite'] = 'pma__favorite';
$cfg['Servers'][$i]['users'] = 'pma__users';
$cfg['Servers'][$i]['usergroups'] = 'pma__usergroups';
$cfg['Servers'][$i]['navigationhiding'] = 'pma__navigationhiding';
$cfg['Servers'][$i]['savedsearches'] = 'pma__savedsearches';
$cfg['Servers'][$i]['central_columns'] = 'pma__central_columns';
$cfg['Servers'][$i]['designer_settings'] = 'pma__designer_settings';
$cfg['Servers'][$i]['export_templates'] = 'pma__export_templates';
"#;
                 fs::write(&config_path, pma_config);
                        break;
                    }
                }
            }

            #[cfg(target_os = "linux")]
            {
                let pma_path = server_dir.join("www").join("phpmyadmin");
                let chmod_cmd = format!(
                    "chmod 755 {1} && find {0} -type d -exec chmod 755 {{}} + && find {0} -type f -exec chmod 644 {{}} +",
                    pma_path.to_string_lossy(),
                    server_dir.join("www").to_string_lossy()
                );
         crate::execute_elevated_command(&["sh", "-c", &chmod_cmd]);
            }

            let pma_path = server_dir.join("www").join("phpmyadmin");
     crate::commands::projects::add_project(
                "phpmyadmin.test".to_string(),
                pma_path.to_string_lossy().to_string(),
                false,
                None,
                false,
            );

            emit_progress(&app, &component_id, 100);
            Ok("phpMyAdmin berhasil diinstal di Linux.".to_string())
        }
        "composer" => {
            emit_progress(&app, &component_id, 10);
            let urls = get_linux_component_urls(&component_id)?;
            let composer_dir = server_dir.join("composer");
            fs::create_dir_all(&composer_dir).map_err(|e| format!("Gagal membuat folder composer: {}", e))?;

            let temp_composer = composer_dir.join("composer.phar");
            download_file_direct(&app, &component_id, urls.primary, urls.fallback, &temp_composer).await?;
            emit_progress(&app, &component_id, 80);

     crate::platform::env_path::register_system_paths();
     crate::platform::env_path::set_php_symlink("php83");

            emit_progress(&app, &component_id, 100);
            Ok("Composer berhasil diinstal di Linux.".to_string())
        }
        _ => Err(format!("ID komponen tidak dikenal: {}", component_id)),
    }
}

#[tauri::command]
pub fn delete_component(component_id: String) -> Result<String, String> {
    let server_dir = get_server_dir_path();

    // Bersihkan sisa unduhan di folder temp jika ada
    let temp_dir = server_dir.join("temp");
    let _ = fs::remove_file(temp_dir.join(format!("{}.zip", component_id)));
    let _ = fs::remove_file(temp_dir.join(format!("{}.zip.part", component_id)));
    let _ = fs::remove_file(temp_dir.join(format!("{}.phar", component_id)));
    let _ = fs::remove_file(temp_dir.join(format!("{}.phar.part", component_id)));
    let _ = fs::remove_file(temp_dir.join(format!("{}.tar.gz", component_id)));
    let _ = fs::remove_file(temp_dir.join(format!("{}.tar.gz.part", component_id)));

    match component_id.as_str() {
        "apache" => {
            let _ = crate::commands::services::control_service("Apache2.4".to_string(), "stop".to_string());
            #[cfg(target_os = "windows")]
            let _ = crate::create_hidden_command("taskkill").args(&["/F", "/IM", "httpd.exe"]).output();

            let path = server_dir.join("Apache24");
            if path.exists() {
                fs::remove_dir_all(&path).map_err(|e| format!("Gagal menghapus folder Apache24: {}", e))?;
            }
            Ok("Apache Web Server berhasil dihapus.".to_string())
        }
        "php85" | "php84" | "php83" | "php82" => {
            let active_php = crate::commands::php::get_active_php_version().unwrap_or_default();
            if active_php == component_id {
                let all = vec!["php85", "php84", "php83", "php82"];
                let other_installed = all.into_iter().find(|id| *id != component_id && server_dir.join(id).exists());
                if let Some(other_id) = other_installed {
                    let _ = crate::commands::php::switch_php_version(other_id.to_string());
                } else {
                    #[cfg(target_os = "windows")]
                    {
                        let php_conf_path = server_dir.join("Apache24").join("conf").join("extra").join("httpd-php.conf");
                        if php_conf_path.exists() {
                            let _ = fs::write(&php_conf_path, "# Envku Modular PHP Configuration\n# Tidak ada modul PHP yang aktif saat ini\n");
                        }
                        if crate::commands::services::check_service_installed("Apache2.4".to_string()).unwrap_or(false) {
                            let _ = crate::commands::services::control_service("Apache2.4".to_string(), "restart".to_string());
                        }
                    }
                }
            }

            let path = server_dir.join(&component_id);
            if path.exists() {
                fs::remove_dir_all(&path).map_err(|e| format!("Gagal menghapus folder {}: {}", component_id, e))?;
            }
            Ok(format!("Modul {} berhasil dihapus.", component_id.to_uppercase()))
        }
        "mysql" => {
            let _ = crate::commands::services::control_service("mysql-server".to_string(), "stop".to_string());
            #[cfg(target_os = "windows")]
            let _ = crate::create_hidden_command("taskkill").args(&["/F", "/IM", "mysqld.exe"]).output();

            let path = server_dir.join("mysql");
            if path.exists() {
                fs::remove_dir_all(&path).map_err(|e| format!("Gagal menghapus folder MySQL: {}", e))?;
            }
            Ok("MySQL Server berhasil dihapus.".to_string())
        }
        "redis" => {
            let _ = crate::commands::services::control_service("redis-server".to_string(), "stop".to_string());
            #[cfg(target_os = "windows")]
            let _ = crate::create_hidden_command("taskkill").args(&["/F", "/IM", "redis-server.exe"]).output();

            let path = server_dir.join("redis");
            if path.exists() {
                fs::remove_dir_all(&path).map_err(|e| format!("Gagal menghapus folder Redis: {}", e))?;
            }
            Ok("Redis Server berhasil dihapus.".to_string())
        }
        "mailpit" => {
            let _ = crate::commands::services::control_service("mailpit".to_string(), "stop".to_string());
            #[cfg(target_os = "windows")]
            let _ = crate::create_hidden_command("taskkill").args(&["/F", "/IM", "mailpit.exe"]).output();

            let path = server_dir.join("mailpit");
            if path.exists() {
                fs::remove_dir_all(&path).map_err(|e| format!("Gagal menghapus folder Mailpit: {}", e))?;
            }
            Ok("Mailpit berhasil dihapus.".to_string())
        }
        "phpmyadmin" => {
            let _ = crate::commands::projects::delete_project("phpmyadmin.test".to_string());
            let path = server_dir.join("www").join("phpmyadmin");
            if path.exists() {
                fs::remove_dir_all(&path).map_err(|e| format!("Gagal menghapus folder phpMyAdmin: {}", e))?;
            }
            Ok("phpMyAdmin berhasil dihapus.".to_string())
        }
        "composer" => {
            let path = server_dir.join("composer");
            if path.exists() {
                fs::remove_dir_all(&path).map_err(|e| format!("Gagal menghapus folder Composer: {}", e))?;
            }
            Ok("Composer berhasil dihapus.".to_string())
        }
        _ => Err(format!("ID komponen {} tidak dikenal.", component_id)),
    }
}
