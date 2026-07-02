use std::fs::{self, File};
use std::path::Path;
use std::io::Write;
use tauri::{AppHandle, Emitter};
use futures_util::StreamExt;
use zip::ZipArchive;
use crate::config::get_server_dir_path;

#[derive(Clone, serde::Serialize)]
pub struct DownloadProgressPayload {
    pub component_id: String,
    pub percentage: u32,
    pub bytes_downloaded: u64,
    pub bytes_total: u64,
}

// Helper to resolve component zip urls
fn get_component_url(component_id: &str) -> Result<&'static str, String> {
    match component_id {
        "apache" => Ok("https://www.apachelounge.com/download/VS18/binaries/httpd-2.4.68-260617-Win64-VS18.zip"),
        "php83" => Ok("https://windows.php.net/downloads/releases/php-8.3.31-Win32-vs16-x64.zip"),
        "php82" => Ok("https://windows.php.net/downloads/releases/php-8.2.31-Win32-vs16-x64.zip"),
        "mysql" => Ok("https://cdn.mysql.com/archives/mysql-8.0/mysql-8.0.39-winx64.zip"),
        "phpmyadmin" => Ok("https://files.phpmyadmin.net/phpMyAdmin/5.2.3/phpMyAdmin-5.2.3-all-languages.zip"),
        "composer" => Ok("https://getcomposer.org/composer.phar"),
        "redis" => Ok("https://github.com/tporadowski/redis/releases/download/v5.0.14.1/Redis-x64-5.0.14.1.zip"),
        "mailpit" => Ok("https://github.com/axllent/mailpit/releases/download/v1.21.1/mailpit-windows-amd64.zip"),
        _ => Err(format!("ID komponen tidak dikenal: {}", component_id)),
    }
}

// Safe ZIP file extraction helper
pub fn extract_zip(zip_path: &Path, target_dir: &Path) -> Result<(), String> {
    let file = File::open(zip_path)
        .map_err(|e| format!("Gagal membuka file ZIP: {}", e))?;
    let mut archive = ZipArchive::new(file)
        .map_err(|e| format!("Gagal memproses file ZIP: {}", e))?;

    for i in 0..archive.len() {
        let mut file = archive.by_index(i)
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
            let mut outfile = File::create(&outpath)
                .map_err(|e| format!("Gagal membuat file output: {}", e))?;
            std::io::copy(&mut file, &mut outfile)
                .map_err(|e| format!("Gagal menyalin data zip: {}", e))?;
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn download_and_extract(app: AppHandle, component_id: String) -> Result<String, String> {
    let url = get_component_url(&component_id)?;
    let client = reqwest::Client::new();
    
    let response = client.get(url).send().await
        .map_err(|e| format!("Gagal mendownload komponen: {}", e))?;

    if !response.status().is_success() {
        return Err(format!(
            "Gagal mendownload komponen (HTTP {}). URL kemungkinan sudah kadaluarsa.",
            response.status()
        ));
    }

    let total_size = response.content_length().unwrap_or(0);
    let mut downloaded: u64 = 0;
    let mut stream = response.bytes_stream();

    let is_zip = component_id != "composer";
    let download_filename = if is_zip {
        format!("{}.zip", component_id)
    } else {
        "composer.phar".to_string()
    };

    let server_dir = get_server_dir_path();
    let temp_dir = server_dir.join("temp");
    fs::create_dir_all(&temp_dir)
        .map_err(|e| format!("Gagal membuat folder temp: {}", e))?;
    
    let file_path = temp_dir.join(&download_filename);
    let mut file = File::create(&file_path)
        .map_err(|e| format!("Gagal membuat file sementara: {}", e))?;

    // Streaming the download
    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result.map_err(|e| format!("Error saat mendownload file: {}", e))?;
        file.write_all(&chunk)
            .map_err(|e| format!("Gagal menulis data ke disk: {}", e))?;
        downloaded += chunk.len() as u64;

        if total_size > 0 {
            let percentage = ((downloaded as f64 / total_size as f64) * 100.0) as u32;
            app.emit("download_progress", DownloadProgressPayload {
                component_id: component_id.clone(),
                percentage,
                bytes_downloaded: downloaded,
                bytes_total: total_size,
            }).unwrap_or(());
        }
    }
    
    // Explicitly flush and drop file before extraction
    file.flush().unwrap_or(());
    drop(file);

    // Stop services to release file locks before extraction
    if component_id == "apache" || component_id == "php83" || component_id == "php82" {
        let _ = crate::commands::services::control_service("Apache2.4".to_string(), "stop".to_string());
        std::thread::sleep(std::time::Duration::from_millis(800));
    }
    if component_id == "mysql" {
        let _ = crate::commands::services::control_service("mysql-server".to_string(), "stop".to_string());
        std::thread::sleep(std::time::Duration::from_millis(800));
    }
    if component_id == "redis" {
        let _ = crate::commands::services::control_service("redis-server".to_string(), "stop".to_string());
        std::thread::sleep(std::time::Duration::from_millis(800));
    }

    if is_zip {
        // Extraction target directories
        let extract_dest = match component_id.as_str() {
            "php83" => server_dir.join("php83"),
            "php82" => server_dir.join("php82"),
            "phpmyadmin" => server_dir.join("www"), // Extracts directly into www
            "redis" => server_dir.join("redis"),
            "mailpit" => server_dir.join("mailpit"),
            _ => server_dir.to_path_buf(), // Apache and MySQL go to base C:\server
        };

        fs::create_dir_all(&extract_dest)
            .map_err(|e| format!("Gagal membuat folder tujuan: {}", e))?;

        extract_zip(&file_path, &extract_dest)?;

        // Post-extraction: restructuring directories
        match component_id.as_str() {
            "apache" => {
                let httpd_conf_path = server_dir.join("Apache24\\conf\\httpd.conf");
                if httpd_conf_path.exists() {
                    let mut content = fs::read_to_string(&httpd_conf_path)
                        .map_err(|e| format!("Gagal membaca httpd.conf: {}", e))?;

                    let server_dir_slash = server_dir.to_string_lossy().replace('\\', "/");
                    content = content.replace("Define SRVROOT \"c:/Apache24\"", &format!("Define SRVROOT \"{}/Apache24\"", server_dir_slash));
                    content = content.replace("Define SRVROOT \"C:/Apache24\"", &format!("Define SRVROOT \"{}/Apache24\"", server_dir_slash));

                    // Enable proxy modules
                    content = content.replace("#LoadModule proxy_module modules/mod_proxy.so", "LoadModule proxy_module modules/mod_proxy.so");
                    content = content.replace("#LoadModule proxy_http_module modules/mod_proxy_http.so", "LoadModule proxy_http_module modules/mod_proxy_http.so");

                    // Enable SSL modules
                    content = content.replace("#LoadModule ssl_module modules/mod_ssl.so", "LoadModule ssl_module modules/mod_ssl.so");
                    content = content.replace("#LoadModule socache_shmcb_module modules/mod_socache_shmcb.so", "LoadModule socache_shmcb_module modules/mod_socache_shmcb.so");

                    // Enable port 443 listening
                    if !content.contains("Listen 443") {
                        content = content.replace("Listen 80", "Listen 80\nListen 443");
                    }

                    // Enable vhosts config file inclusion
                    content = content.replace("#Include conf/extra/httpd-vhosts.conf", "Include conf/extra/httpd-vhosts.conf");

                    // Set index.php as default DirectoryIndex
                    content = content.replace("DirectoryIndex index.html", "DirectoryIndex index.php index.html");

                    fs::write(&httpd_conf_path, content)
                        .map_err(|e| format!("Gagal memperbarui httpd.conf setelah ekstraksi: {}", e))?;
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
                    let config = format!(r#"[mysqld]
basedir={}/mysql
datadir={}/mysql/data
port=3306
character-set-server=utf8mb4
default-storage-engine=INNODB
sql_mode=NO_ENGINE_SUBSTITUTION
default_authentication_plugin=mysql_native_password
"#, server_dir_slash, server_dir_slash);
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
            "php83" | "php82" => {
                let php_dir = server_dir.join(&component_id);
                let php_ini_path = php_dir.join("php.ini");
                if !php_ini_path.exists() {
                    let dev_ini = php_dir.join("php.ini-development");
                    if dev_ini.exists() {
                        let mut content = fs::read_to_string(&dev_ini)
                            .map_err(|e| format!("Gagal membaca php.ini-development: {}", e))?;

                        // Enable extension_dir
                        content = content.replace(";extension_dir = \"ext\"", "extension_dir = \"ext\"");

                        // Enable common extensions
                        content = content.replace(";extension=curl", "extension=curl");
                        content = content.replace(";extension=gd", "extension=gd");
                        content = content.replace(";extension=mbstring", "extension=mbstring");
                        content = content.replace(";extension=mysqli", "extension=mysqli");
                        content = content.replace(";extension=openssl", "extension=openssl");
                        content = content.replace(";extension=pdo_mysql", "extension=pdo_mysql");

                        fs::write(&php_ini_path, content)
                            .map_err(|e| format!("Gagal menulis php.ini baru setelah ekstraksi: {}", e))?;
                    }
                }
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

    // Cleanup Zip & Temp dir
    if is_zip {
        fs::remove_file(&file_path).unwrap_or(());
    } else {
        let _ = fs::remove_file(&file_path);
    }
    let _ = fs::remove_dir(&temp_dir); // Only succeeds if empty

    // Re-register phpmyadmin virtual host if needed
    let pma_path = server_dir.join("www").join("phpmyadmin");
    let _ = crate::commands::projects::add_project(
        "phpmyadmin.test".to_string(),
        pma_path.to_string_lossy().to_string(),
        false,
        None,
        false
    );

    // Automatically register newly downloaded paths to system PATH
    let _ = crate::commands::env::register_system_paths();

    Ok(format!("Komponen {} berhasil di-download dan di-ekstrak.", component_id.to_uppercase()))
}
