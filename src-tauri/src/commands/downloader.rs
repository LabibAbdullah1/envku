use crate::config::get_server_dir_path;
use futures_util::StreamExt;
use std::fs::{self, File};
use std::io::Write;
use std::path::Path;
use tauri::{AppHandle, Emitter};
use zip::ZipArchive;

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
        "php83" => Ok("https://windows.php.net/downloads/releases/php-8.3.32-Win32-vs16-x64.zip"),
        "php82" => Ok("https://windows.php.net/downloads/releases/php-8.2.32-Win32-vs16-x64.zip"),
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
            let mut outfile =
                File::create(&outpath).map_err(|e| format!("Gagal membuat file output: {}", e))?;
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

    let url = get_component_url(&component_id)?;
    let client = reqwest::Client::new();

    let response = client
        .get(url)
        .send()
        .await
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
    fs::create_dir_all(&temp_dir).map_err(|e| format!("Gagal membuat folder temp: {}", e))?;

    let file_path = temp_dir.join(&download_filename);
    let mut file =
        File::create(&file_path).map_err(|e| format!("Gagal membuat file sementara: {}", e))?;

    // Streaming the download
    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result.map_err(|e| format!("Error saat mendownload file: {}", e))?;
        file.write_all(&chunk)
            .map_err(|e| format!("Gagal menulis data ke disk: {}", e))?;
        downloaded += chunk.len() as u64;

        if total_size > 0 {
            let percentage = ((downloaded as f64 / total_size as f64) * 100.0) as u32;
            app.emit(
                "download_progress",
                DownloadProgressPayload {
                    component_id: component_id.clone(),
                    percentage,
                    bytes_downloaded: downloaded,
                    bytes_total: total_size,
                },
            )
            .unwrap_or(());
        }
    }

    // Explicitly flush and drop file before extraction
    file.flush().unwrap_or(());
    drop(file);

    // Stop services to release file locks before extraction
    if component_id == "apache" || component_id == "php83" || component_id == "php82" {
        let _ =
            crate::commands::services::control_service("Apache2.4".to_string(), "stop".to_string());
        std::thread::sleep(std::time::Duration::from_millis(800));
    }
    if component_id == "mysql" {
        let _ = crate::commands::services::control_service(
            "mysql-server".to_string(),
            "stop".to_string(),
        );
        std::thread::sleep(std::time::Duration::from_millis(800));
    }
    if component_id == "redis" {
        let _ = crate::commands::services::control_service(
            "redis-server".to_string(),
            "stop".to_string(),
        );
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
                    content = content.replace(
                        "Define SRVROOT \"c:/Apache24\"",
                        &format!("Define SRVROOT \"{}/Apache24\"", server_dir_slash),
                    );
                    content = content.replace(
                        "Define SRVROOT \"C:/Apache24\"",
                        &format!("Define SRVROOT \"{}/Apache24\"", server_dir_slash),
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

                    fs::write(&httpd_conf_path, content).map_err(|e| {
                        format!("Gagal memperbarui httpd.conf setelah ekstraksi: {}", e)
                    })?;
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
                        content =
                            content.replace(";extension_dir = \"ext\"", "extension_dir = \"ext\"");

                        // Enable common extensions
                        content = content.replace(";extension=curl", "extension=curl");
                        content = content.replace(";extension=gd", "extension=gd");
                        content = content.replace(";extension=mbstring", "extension=mbstring");
                        content = content.replace(";extension=mysqli", "extension=mysqli");
                        content = content.replace(";extension=openssl", "extension=openssl");
                        content = content.replace(";extension=pdo_mysql", "extension=pdo_mysql");

                        fs::write(&php_ini_path, content).map_err(|e| {
                            format!("Gagal menulis php.ini baru setelah ekstraksi: {}", e)
                        })?;
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
        false,
    );

    // Automatically register newly downloaded paths to system PATH
    let _ = crate::platform::env_path::register_system_paths();

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
async fn download_file_direct(app: &AppHandle, component_id: &str, url: &str, dest_path: &Path) -> Result<(), String> {
    let client = reqwest::Client::new();
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Gagal mendownload file: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Gagal mendownload file (HTTP {})", response.status()));
    }

    let total_size = response.content_length().unwrap_or(0);
    let mut downloaded: u64 = 0;
    let mut stream = response.bytes_stream();
    let mut file = File::create(dest_path).map_err(|e| format!("Gagal membuat file: {}", e))?;

    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result.map_err(|e| format!("Error saat streaming download: {}", e))?;
        file.write_all(&chunk).map_err(|e| format!("Gagal menulis data ke disk: {}", e))?;
        downloaded += chunk.len() as u64;

        if total_size > 0 {
            let percentage = ((downloaded as f64 / total_size as f64) * 100.0) as u32;
            let scaled_percentage = 10 + ((percentage * 60) / 100);
            app.emit(
                "download_progress",
                DownloadProgressPayload {
                    component_id: component_id.to_string(),
                    percentage: scaled_percentage,
                    bytes_downloaded: downloaded,
                    bytes_total: total_size,
                },
            )
            .unwrap_or(());
        }
    }

    file.flush().unwrap_or(());
    Ok(())
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
        let _ = fs::remove_file(temp_sources);
        run_res?;
    } else {
        // Dapatkan nama codename sistem
        let codename = os_info.get("VERSION_CODENAME")
            .map(|s| s.as_str())
            .or_else(|| os_info.get("UBUNTU_CODENAME").map(|s| s.as_str()))
            .unwrap_or("noble");

        // Periksa apakah Launchpad PPA memiliki folder rilis untuk codename ini secara asinkron
        let client = reqwest::Client::new();
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
            let cmd_str = "apt-get update && apt-get install -y apache2 && a2enmod ssl && a2enmod proxy && a2enmod proxy_http && a2enmod rewrite && a2enmod headers";
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
        "php83" | "php82" => {
            let php_version_dot = if component_id == "php83" { "8.3" } else { "8.2" };
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
            emit_progress(&app, &component_id, 80);

            let dest_php_dir = server_dir.join(&component_id).join("bin");
            fs::create_dir_all(&dest_php_dir).map_err(|e| format!("Gagal membuat folder PHP bin: {}", e))?;
            
            let system_php_bin = format!("/usr/bin/php{}", php_version_dot);
            let local_php_bin = dest_php_dir.join("php");
            if local_php_bin.exists() || local_php_bin.is_symlink() {
                let _ = fs::remove_file(&local_php_bin);
            }
            std::os::unix::fs::symlink(&system_php_bin, &local_php_bin)
                .map_err(|e| format!("Gagal membuat symlink PHP ke /usr/bin/php: {}", e))?;

            let local_ini = server_dir.join(&component_id).join("php.ini");
            if !local_ini.exists() {
                let sys_ini = format!("/etc/php/{}/cli/php.ini", php_version_dot);
                if Path::new(&sys_ini).exists() {
                    let _ = fs::copy(&sys_ini, &local_ini);
                } else {
                    let _ = fs::write(&local_ini, "; Empty php.ini for envku\n");
                }
            }

            emit_progress(&app, &component_id, 100);
            Ok(format!("PHP {} berhasil diinstal dan dikonfigurasi di Linux.", php_version_dot))
        }
        "mysql" => {
            emit_progress(&app, &component_id, 10);
            run_pkexec_command(&["sh", "-c", "apt-get update && apt-get install -y mysql-server"])?;
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

            let dest_bin_dir = server_dir.join("mysql").join("bin");
            fs::create_dir_all(&dest_bin_dir).unwrap_or(());
            let local_mysql = dest_bin_dir.join("mysql");
            if local_mysql.exists() || local_mysql.is_symlink() {
                let _ = fs::remove_file(&local_mysql);
            }
            let _ = std::os::unix::fs::symlink("/usr/bin/mysql", &local_mysql);

            emit_progress(&app, &component_id, 100);
            Ok("MySQL Server berhasil diinstal di Linux.".to_string())
        }
        "redis" => {
            emit_progress(&app, &component_id, 10);
            run_pkexec_command(&["sh", "-c", "apt-get update && apt-get install -y redis-server"])?;
            emit_progress(&app, &component_id, 80);

            let conf_path = config_dir.join("redis.conf");
            if !conf_path.exists() {
                let default_redis_conf = r#"bind 127.0.0.1 ::1
port 6379
daemonize no
pidfile /var/run/redis/redis-server.pid
logfile /var/log/redis/redis-server.log
databases 16
save 900 1
save 300 10
save 60
dir /var/lib/redis
"#;
                fs::write(&conf_path, default_redis_conf).map_err(|e| format!("Gagal menulis redis.conf: {}", e))?;
            }

            let dest_bin_dir = server_dir.join("redis");
            fs::create_dir_all(&dest_bin_dir).unwrap_or(());
            let local_redis_cli = dest_bin_dir.join("redis-cli");
            if local_redis_cli.exists() || local_redis_cli.is_symlink() {
                let _ = fs::remove_file(&local_redis_cli);
            }
            let _ = std::os::unix::fs::symlink("/usr/bin/redis-cli", &local_redis_cli);

            emit_progress(&app, &component_id, 100);
            Ok("Redis Server berhasil diinstal di Linux.".to_string())
        }
        "mailpit" => {
            emit_progress(&app, &component_id, 10);
            let url = "https://github.com/axllent/mailpit/releases/download/v1.21.1/mailpit-linux-amd64.tar.gz";
            let mailpit_dir = server_dir.join("mailpit");
            fs::create_dir_all(&mailpit_dir).map_err(|e| format!("Gagal membuat folder mailpit: {}", e))?;

            let temp_tar = server_dir.join("temp").join("mailpit.tar.gz");
            if let Some(parent) = temp_tar.parent() {
                fs::create_dir_all(parent).unwrap_or(());
            }

            download_file_direct(&app, &component_id, url, &temp_tar).await?;
            emit_progress(&app, &component_id, 80);

            let output = std::process::Command::new("tar")
                .args(&["-xzf", &temp_tar.to_string_lossy(), "-C", &mailpit_dir.to_string_lossy()])
                .output()
                .map_err(|e| format!("Gagal menjalankan tar untuk ekstrak mailpit: {}", e))?;

            let _ = fs::remove_file(&temp_tar);

            if !output.status.success() {
                return Err("Gagal mengekstrak Mailpit tar.gz".to_string());
            }

            // Auto register mailpit systemd service
            let _ = crate::platform::services::install_service("mailpit");

            emit_progress(&app, &component_id, 100);
            Ok("Mailpit berhasil diinstal di Linux.".to_string())
        }
        "phpmyadmin" => {
            emit_progress(&app, &component_id, 10);
            let url = "https://files.phpmyadmin.net/phpMyAdmin/5.2.3/phpMyAdmin-5.2.3-all-languages.zip";
            let www_dir = server_dir.join("www");
            fs::create_dir_all(&www_dir).map_err(|e| format!("Gagal membuat folder www: {}", e))?;

            let temp_zip = server_dir.join("temp").join("phpmyadmin.zip");
            if let Some(parent) = temp_zip.parent() {
                fs::create_dir_all(parent).unwrap_or(());
            }

            download_file_direct(&app, &component_id, url, &temp_zip).await?;
            emit_progress(&app, &component_id, 60);

            extract_zip(&temp_zip, &www_dir)?;
            let _ = fs::remove_file(&temp_zip);

            let entries = fs::read_dir(&www_dir).map_err(|e| format!("Gagal membaca www dir: {}", e))?;
            for entry in entries {
                if let Ok(entry) = entry {
                    let name = entry.file_name().to_string_lossy().into_owned();
                    if name.starts_with("phpMyAdmin-") && entry.path().is_dir() {
                        let dest = www_dir.join("phpmyadmin");
                        if dest.exists() {
                            let _ = fs::remove_dir_all(&dest);
                        }
                        let _ = fs::rename(entry.path(), &dest);
                        
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
                        let _ = fs::write(&config_path, pma_config);
                        break;
                    }
                }
            }

            let pma_path = server_dir.join("www").join("phpmyadmin");
            let _ = crate::commands::projects::add_project(
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
            let url = "https://getcomposer.org/composer.phar";
            let composer_dir = server_dir.join("composer");
            fs::create_dir_all(&composer_dir).map_err(|e| format!("Gagal membuat folder composer: {}", e))?;

            let temp_composer = composer_dir.join("composer.phar");
            download_file_direct(&app, &component_id, url, &temp_composer).await?;
            emit_progress(&app, &component_id, 80);

            let _ = crate::platform::env_path::register_system_paths();
            let _ = crate::platform::env_path::set_php_symlink("php83");

            emit_progress(&app, &component_id, 100);
            Ok("Composer berhasil diinstal di Linux.".to_string())
        }
        _ => Err(format!("ID komponen tidak dikenal: {}", component_id)),
    }
}
