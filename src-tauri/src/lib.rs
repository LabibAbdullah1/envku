use std::fs::{self, File};
use std::path::Path;
use std::io::Write;
use std::process::Command;
use tauri::{AppHandle, Emitter};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

fn create_hidden_command(program: &str) -> Command {
    let mut cmd = Command::new(program);
    #[cfg(target_os = "windows")]
    {
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    cmd
}
use futures_util::StreamExt;
use zip::ZipArchive;
use winreg::enums::{HKEY_LOCAL_MACHINE, KEY_ALL_ACCESS, KEY_READ};
use winreg::RegKey;

#[derive(Clone, serde::Serialize)]
struct DownloadProgressPayload {
    component_id: String,
    percentage: u32,
    bytes_downloaded: u64,
    bytes_total: u64,
}

// Helper to resolve component zip urls
fn get_component_url(component_id: &str) -> Result<&'static str, String> {
    match component_id {
        "apache" => Ok("https://www.apachelounge.com/download/VS18/binaries/httpd-2.4.68-260617-Win64-VS18.zip"),
        "php83" => Ok("https://windows.php.net/downloads/releases/php-8.3.31-Win32-vs16-x64.zip"),
        "php82" => Ok("https://windows.php.net/downloads/releases/php-8.2.31-Win32-vs16-x64.zip"),
        "mysql" => Ok("https://cdn.mysql.com/archives/mysql-8.0/mysql-8.0.39-winx64.zip"),
        "phpmyadmin" => Ok("https://files.phpmyadmin.net/phpMyAdmin/5.2.3/phpMyAdmin-5.2.3-all-languages.zip"),
        _ => Err(format!("ID komponen tidak dikenal: {}", component_id)),
    }
}

// Safe ZIP file extraction helper
fn extract_zip(zip_path: &Path, target_dir: &Path) -> Result<(), String> {
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
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

// Modul 0: Check environment & create C:\server\www
#[tauri::command]
fn check_and_init_environment() -> Result<String, String> {
    let base_path = Path::new("C:\\server");
    let www_path = base_path.join("www");

    let res = if base_path.exists() {
        Ok("exists".to_string())
    } else {
        match fs::create_dir_all(&www_path) {
            Ok(_) => Ok("created".to_string()),
            Err(e) => Err(format!(
                "Gagal menginisialisasi folder server (C:\\server\\www): {}. Pastikan aplikasi dijalankan dengan hak akses Administrator (Run as Administrator).",
                e
            )),
        }
    };

    ensure_phpmyadmin_host();
    res
}

// Modul 0.5: Check directory existence for multiple paths
#[tauri::command]
fn check_directories_exist(paths: Vec<String>) -> Result<std::collections::HashMap<String, bool>, String> {
    let mut result = std::collections::HashMap::new();
    for path in paths {
        let exists = Path::new(&path).exists();
        result.insert(path, exists);
    }
    Ok(result)
}

// Modul 1: Async downloader & extractor with progress emitter
#[tauri::command]
async fn download_and_extract(app: AppHandle, component_id: String) -> Result<String, String> {
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

    let temp_dir = Path::new("C:\\server\\temp");
    fs::create_dir_all(temp_dir)
        .map_err(|e| format!("Gagal membuat folder temp: {}", e))?;
    
    let zip_path = temp_dir.join(format!("{}.zip", component_id));
    let mut file = File::create(&zip_path)
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
        let _ = control_service("Apache2.4".to_string(), "stop".to_string());
        std::thread::sleep(std::time::Duration::from_millis(800));
    }
    if component_id == "mysql" {
        let _ = control_service("MySQL-Kustom".to_string(), "stop".to_string());
        std::thread::sleep(std::time::Duration::from_millis(800));
    }

    // Extraction target directories
    let server_dir = Path::new("C:\\server");
    let extract_dest = match component_id.as_str() {
        "php83" => server_dir.join("php83"),
        "php82" => server_dir.join("php82"),
        "phpmyadmin" => server_dir.join("www"), // Extracts directly into www
        _ => server_dir.to_path_buf(), // Apache and MySQL go to base C:\server
    };

    fs::create_dir_all(&extract_dest)
        .map_err(|e| format!("Gagal membuat folder tujuan: {}", e))?;

    extract_zip(&zip_path, &extract_dest)?;

    // Post-extraction: restructuring directories (wildcard match versions)
    match component_id.as_str() {
        "apache" => {
            let httpd_conf_path = server_dir.join("Apache24\\conf\\httpd.conf");
            if httpd_conf_path.exists() {
                let mut content = fs::read_to_string(&httpd_conf_path)
                    .map_err(|e| format!("Gagal membaca httpd.conf: {}", e))?;

                // Fix SRVROOT
                content = content.replace("Define SRVROOT \"c:/Apache24\"", "Define SRVROOT \"C:/server/Apache24\"");
                content = content.replace("Define SRVROOT \"C:/Apache24\"", "Define SRVROOT \"C:/server/Apache24\"");

                // Enable proxy modules
                content = content.replace("#LoadModule proxy_module modules/mod_proxy.so", "LoadModule proxy_module modules/mod_proxy.so");
                content = content.replace("#LoadModule proxy_http_module modules/mod_proxy_http.so", "LoadModule proxy_http_module modules/mod_proxy_http.so");

                // Enable vhosts config file inclusion
                content = content.replace("#Include conf/extra/httpd-vhosts.conf", "Include conf/extra/httpd-vhosts.conf");

                // Set index.php as default DirectoryIndex
                content = content.replace("DirectoryIndex index.html", "DirectoryIndex index.php index.html");

                fs::write(&httpd_conf_path, content)
                    .map_err(|e| format!("Gagal memperbarui httpd.conf setelah ekstraksi: {}", e))?;
            }
        }
        "mysql" => {
            let entries = fs::read_dir(server_dir)
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
                let config = r#"[mysqld]
basedir=C:/server/mysql
datadir=C:/server/mysql/data
port=3306
character-set-server=utf8mb4
default-storage-engine=INNODB
sql_mode=NO_ENGINE_SUBSTITUTION
default_authentication_plugin=mysql_native_password
"#;
                let _ = fs::write(&my_ini_path, config);

                // Automatically initialize datadir if it does not exist
                let data_dir = dest.join("data");
                if !data_dir.exists() {
                    let _ = create_hidden_command("C:\\server\\mysql\\bin\\mysqld.exe")
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

    // Cleanup Zip & Temp dir
    fs::remove_file(&zip_path).unwrap_or(());
    let _ = fs::remove_dir(temp_dir); // Only succeeds if empty

    ensure_phpmyadmin_host();

    Ok(format!("Komponen {} berhasil di-download dan di-ekstrak.", component_id.to_uppercase()))
}

// Modul 2: Service controls
#[tauri::command]
fn check_service_installed(service: String) -> Result<bool, String> {
    let output = create_hidden_command("sc")
        .args(&["query", &service])
        .output()
        .map_err(|e| format!("Gagal menjalankan query service: {}", e))?;
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    if stdout.contains("1060") {
        Ok(false)
    } else {
        Ok(output.status.success() || stdout.contains("TYPE"))
    }
}

#[tauri::command]
fn control_service(service: String, action: String) -> Result<String, String> {
    let action_arg = match action.as_str() {
        "start" => "start",
        "stop" => "stop",
        _ => return Err("Aksi tidak valid (gunakan start/stop)".to_string()),
    };

    let output = create_hidden_command("net")
        .args(&[action_arg, &service])
        .output()
        .map_err(|e| format!("Gagal mengontrol service: {}", e))?;

    if output.status.success() {
        if service == "MySQL-Kustom" && action == "start" {
            // Wait 1.5s for MySQL database server to fully boot up and bind to port 3306
            std::thread::sleep(std::time::Duration::from_millis(1500));

            let sql_path = Path::new("C:\\server\\www\\phpmyadmin\\sql\\create_tables.sql");
            if sql_path.exists() {
                let _ = create_hidden_command("C:\\server\\mysql\\bin\\mysql.exe")
                    .args(&["-u", "root", "-e", "source C:\\server\\www\\phpmyadmin\\sql\\create_tables.sql"])
                    .output();
            }
        }
        Ok(format!("Service {} berhasil di-{}", service, action))
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        Err(format!(
            "Gagal mengontrol service. Stderr: {}. Stdout: {}",
            stderr.trim(),
            stdout.trim()
        ))
    }
}

#[tauri::command]
fn install_service(service: String) -> Result<String, String> {
    if service == "Apache2.4" {
        let output = create_hidden_command("C:\\server\\Apache24\\bin\\httpd.exe")
            .args(&["-k", "install", "-n", "Apache2.4"])
            .output()
            .map_err(|e| format!("Gagal menginstal service Apache: {}", e))?;
        if output.status.success() {
            Ok("Service Apache2.4 berhasil diinstal".to_string())
        } else {
            Err(String::from_utf8_lossy(&output.stderr).to_string())
        }
    } else if service == "MySQL-Kustom" {
        let mysql_dir = Path::new("C:\\server\\mysql");
        let my_ini_path = mysql_dir.join("my.ini");
        if !my_ini_path.exists() {
            let config = r#"[mysqld]
basedir=C:/server/mysql
datadir=C:/server/mysql/data
port=3306
character-set-server=utf8mb4
default-storage-engine=INNODB
sql_mode=NO_ENGINE_SUBSTITUTION
default_authentication_plugin=mysql_native_password
"#;
            fs::write(&my_ini_path, config)
                .map_err(|e| format!("Gagal menulis my.ini: {}", e))?;
        }

        let data_dir = mysql_dir.join("data");
        if !data_dir.exists() {
            // Insecure initialization of datadir (creates root@localhost with empty password)
            let _ = create_hidden_command("C:\\server\\mysql\\bin\\mysqld.exe")
                .args(&["--initialize-insecure", "--user=mysql"])
                .output();
        }

        // Delete existing service if any to avoid collision or wrong executable paths
        let _ = create_hidden_command("sc")
            .args(&["delete", "MySQL-Kustom"])
            .output();

        let output = create_hidden_command("C:\\server\\mysql\\bin\\mysqld.exe")
            .args(&["--install", "MySQL-Kustom", "--defaults-file=C:\\server\\mysql\\my.ini"])
            .output()
            .map_err(|e| format!("Gagal menginstal service MySQL: {}", e))?;
        if output.status.success() {
            Ok("Service MySQL-Kustom berhasil diinstal".to_string())
        } else {
            Err(String::from_utf8_lossy(&output.stderr).to_string())
        }
    } else {
        Err(format!("Service {} tidak dikenal untuk diinstal", service))
    }
}

#[tauri::command]
fn ping_port(port: u16) -> bool {
    use std::net::{TcpStream, ToSocketAddrs};
    use std::time::Duration;
    let addr = format!("127.0.0.1:{}", port);
    if let Ok(mut addrs) = addr.to_socket_addrs() {
        if let Some(sockaddr) = addrs.next() {
            return TcpStream::connect_timeout(&sockaddr, Duration::from_millis(200)).is_ok();
        }
    }
    false
}

// Modul 3: Project Wizard (vhosts and hosts updates)
#[tauri::command]
fn add_project(domain: String, document_root: String, is_node: bool, node_port: Option<u16>) -> Result<String, String> {
    // 1. Hosts file modification
    let hosts_path = Path::new("C:\\Windows\\System32\\drivers\\etc\\hosts");
    let mut hosts_content = fs::read_to_string(hosts_path)
        .map_err(|e| format!("Gagal membaca file hosts: {}", e))?;

    let host_entry = format!("127.0.0.1 {}", domain);
    let domain_exists = hosts_content.lines().any(|line| {
        let clean = line.trim();
        !clean.starts_with('#') && clean.contains(&domain)
    });

    if !domain_exists {
        if !hosts_content.ends_with('\n') {
            hosts_content.push('\n');
        }
        hosts_content.push_str(&format!("{}\n", host_entry));
        fs::write(hosts_path, &hosts_content)
            .map_err(|e| format!("Gagal menulis ke file hosts: {}. Pastikan dijalankan sebagai Administrator.", e))?;
    }

    // 2. Vhosts config update
    let vhosts_path = Path::new("C:\\server\\Apache24\\conf\\extra\\httpd-vhosts.conf");
    if !vhosts_path.exists() {
        if let Some(parent) = vhosts_path.parent() {
            fs::create_dir_all(parent).unwrap_or(());
        }
        fs::write(vhosts_path, "").unwrap_or(());
    }

    let mut vhosts_content = fs::read_to_string(vhosts_path)
        .map_err(|e| format!("Gagal membaca httpd-vhosts.conf: {}", e))?;

    let vhost_exists = vhosts_content.contains(&format!("ServerName {}", domain));

    if !vhost_exists {
        let vhost_block = if is_node {
            let port = node_port.unwrap_or(3000);
            format!(
                r#"
<VirtualHost *:80>
    ServerName {}
    ProxyPreserveHost On
    ProxyPass / http://localhost:{}/
    ProxyPassReverse / http://localhost:{}/
</VirtualHost>
"#,
                domain, port, port
            )
        } else {
            let clean_doc_root = document_root.replace('\\', "/");
            format!(
                r#"
<VirtualHost *:80>
    DocumentRoot "{}"
    ServerName {}
    <Directory "{}">
        Options Indexes FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>
</VirtualHost>
"#,
                clean_doc_root, domain, clean_doc_root
            )
        };

        if !vhosts_content.ends_with('\n') {
            vhosts_content.push('\n');
        }
        vhosts_content.push_str(&vhost_block);
        fs::write(vhosts_path, &vhosts_content)
            .map_err(|e| format!("Gagal menulis httpd-vhosts.conf: {}", e))?;
    }

    // 3. Restart Apache to load new configurations
    let _ = control_service("Apache2.4".to_string(), "stop".to_string());
    let _ = control_service("Apache2.4".to_string(), "start".to_string());

    Ok(format!("Proyek {} berhasil ditambahkan dan Apache di-restart.", domain))
}

fn ensure_phpmyadmin_host() {
    let pma_dir = Path::new("C:\\server\\www\\phpmyadmin");
    let apache_dir = Path::new("C:\\server\\Apache24");
    if pma_dir.exists() && apache_dir.exists() {
        let _ = add_project("phpmyadmin.test".to_string(), "C:\\server\\www\\phpmyadmin".to_string(), false, None);
    }
}

#[tauri::command]
fn delete_project(domain: String) -> Result<String, String> {
    // 1. Remove from hosts file
    let hosts_path = Path::new("C:\\Windows\\System32\\drivers\\etc\\hosts");
    if hosts_path.exists() {
        let hosts_content = fs::read_to_string(hosts_path)
            .map_err(|e| format!("Gagal membaca file hosts: {}", e))?;
        
        let new_lines: Vec<String> = hosts_content.lines()
            .filter(|line| {
                let clean = line.trim();
                clean.starts_with('#') || !clean.contains(&domain)
            })
            .map(|s| s.to_string())
            .collect();
            
        let mut new_content = new_lines.join("\n");
        if !new_content.ends_with('\n') && !new_content.is_empty() {
            new_content.push('\n');
        }
        
        fs::write(hosts_path, new_content)
            .map_err(|e| format!("Gagal menulis ke file hosts: {}. Pastikan dijalankan sebagai Administrator.", e))?;
    }

    // 2. Remove from httpd-vhosts.conf
    let vhosts_path = Path::new("C:\\server\\Apache24\\conf\\extra\\httpd-vhosts.conf");
    if vhosts_path.exists() {
        let vhosts_content = fs::read_to_string(vhosts_path)
            .map_err(|e| format!("Gagal membaca httpd-vhosts.conf: {}", e))?;
            
        let mut new_content = String::new();
        let mut in_target_vhost = false;
        let mut current_block = Vec::new();
        let mut has_servername = false;

        for line in vhosts_content.lines() {
            let trimmed = line.trim();
            if trimmed.to_lowercase().starts_with("<virtualhost") {
                if !current_block.is_empty() {
                    new_content.push_str(&current_block.join("\n"));
                    new_content.push('\n');
                    current_block.clear();
                }
                in_target_vhost = true;
                current_block.push(line.to_string());
                has_servername = false;
            } else if trimmed.to_lowercase().starts_with("</virtualhost>") {
                if in_target_vhost {
                    current_block.push(line.to_string());
                    if !has_servername {
                        new_content.push_str(&current_block.join("\n"));
                        new_content.push('\n');
                    }
                    current_block.clear();
                    in_target_vhost = false;
                } else {
                    new_content.push_str(line);
                    new_content.push('\n');
                }
            } else if in_target_vhost {
                current_block.push(line.to_string());
                let lower = trimmed.to_lowercase();
                if lower.starts_with("servername") {
                    let s_name = trimmed["servername".len()..].trim().to_string();
                    if s_name == domain {
                        has_servername = true;
                    }
                }
            } else {
                new_content.push_str(line);
                new_content.push('\n');
            }
        }

        if !current_block.is_empty() {
            new_content.push_str(&current_block.join("\n"));
            new_content.push('\n');
        }

        fs::write(vhosts_path, new_content.trim_end())
            .map_err(|e| format!("Gagal menulis httpd-vhosts.conf: {}", e))?;
    }

    // 3. Restart Apache to apply changes
    let _ = control_service("Apache2.4".to_string(), "stop".to_string());
    let _ = control_service("Apache2.4".to_string(), "start".to_string());

    Ok(format!("Proyek {} berhasil dihapus.", domain))
}

// Modul 4: PHP Multi-Version Switcher
#[tauri::command]
fn switch_php_version(version_id: String) -> Result<String, String> {
    let target_php_dir = format!("C:\\server\\{}", version_id);
    let target_php_path = Path::new(&target_php_dir);
    if !target_php_path.exists() {
        return Err(format!("Folder PHP {} tidak ditemukan. Silakan download komponen terlebih dahulu.", version_id));
    }

    let httpd_conf_path = Path::new("C:\\server\\Apache24\\conf\\httpd.conf");
    if !httpd_conf_path.exists() {
        return Err("File httpd.conf Apache tidak ditemukan di C:\\server\\Apache24\\conf\\httpd.conf".to_string());
    }

    let mut conf_content = fs::read_to_string(httpd_conf_path)
        .map_err(|e| format!("Gagal membaca httpd.conf: {}", e))?;

    let load_module_pattern = "LoadModule php_module";
    let has_module = conf_content.contains(load_module_pattern);

    let php_module_block = format!(
        r#"# PHP Config
LoadModule php_module "C:/server/{}/php8apache2_4.dll"
AddHandler application/x-httpd-php .php
PHPIniDir "C:/server/{}"
"#,
        version_id, version_id
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
                format!("LoadModule php_module \"C:/server/{}/php8apache2_4.dll\"", version_id),
                format!("AddHandler application/x-httpd-php .php"),
                format!("PHPIniDir \"C:/server/{}\"", version_id),
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

    fs::write(httpd_conf_path, &conf_content)
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
    let mut clean_paths: Vec<String> = paths.into_iter()
        .map(|p| p.to_string())
        .filter(|p| {
            let clean = p.to_lowercase();
            !clean.contains("c:\\server\\php")
        })
        .collect();

    clean_paths.push(target_php_dir.clone());

    let new_path_val = clean_paths.join(";");
    env_key.set_value("Path", &new_path_val)
        .map_err(|e| format!("Gagal menulis PATH baru ke registry: {}", e))?;

    // Refresh Windows environment (broadcast setting change so explorer picks it up)
    let _ = create_hidden_command("powershell.exe")
        .args(&[
            "-Command",
            "$signature = @'\n[DllImport(\"user32.dll\", SetLastError = true, CharSet = CharSet.Auto)]\npublic static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint Msg, IntPtr wParam, string lParam, uint fuFlags, uint uTimeout, out IntPtr lpdwResult);\n'@\n$type = Add-Type -MemberDefinition $signature -Name \"Win32\" -Namespace \"Env\" -PassThru\n$type::SendMessageTimeout(0xffff, 0x001A, 0, \"Environment\", 2, 2000, [ref][IntPtr]::Zero) | Out-Null"
        ])
        .output();

    // Restart Apache
    let _ = control_service("Apache2.4".to_string(), "stop".to_string());
    let _ = control_service("Apache2.4".to_string(), "start".to_string());

    Ok(format!("Berhasil beralih ke PHP {}. Apache di-restart dan PATH diperbarui.", version_id.to_uppercase()))
}

// Modul 5: NVM/Node.js Swapper
#[tauri::command]
fn get_nvm_versions() -> Result<Vec<String>, String> {
    let output = create_hidden_command("powershell.exe")
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
fn switch_node_version(version: String) -> Result<String, String> {
    let output = create_hidden_command("powershell.exe")
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
fn install_node_version(version: String) -> Result<String, String> {
    let output = create_hidden_command("powershell.exe")
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
async fn install_nvm() -> Result<String, String> {
    // 1. Download nvm-setup.zip
    let url = "https://github.com/coreybutler/nvm-windows/releases/download/1.1.12/nvm-setup.zip";
    let client = reqwest::Client::new();
    let response = client.get(url).send().await
        .map_err(|e| format!("Gagal mengunduh NVM installer: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Gagal mengunduh NVM installer (HTTP {}).", response.status()));
    }

    let temp_dir = Path::new("C:\\server\\temp");
    fs::create_dir_all(temp_dir)
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
    extract_zip(&zip_path, temp_dir)?;

    // 3. Execute nvm-setup.exe silently
    let setup_exe = temp_dir.join("nvm-setup.exe");
    if !setup_exe.exists() {
        return Err("File nvm-setup.exe tidak ditemukan di dalam paket ZIP.".to_string());
    }

    let output = create_hidden_command(&setup_exe.to_string_lossy())
        .args(&["/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART"])
        .output()
        .map_err(|e| format!("Gagal menjalankan instalasi NVM: {}", e))?;

    // Cleanup files
    fs::remove_file(&zip_path).unwrap_or(());
    fs::remove_file(&setup_exe).unwrap_or(());

    if output.status.success() {
        // Broadcast environment update so NVM path is registered globally
        let _ = create_hidden_command("powershell.exe")
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

#[tauri::command]
fn get_active_php_version() -> Result<String, String> {
    let httpd_conf_path = Path::new("C:\\server\\Apache24\\conf\\httpd.conf");
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

#[tauri::command]
fn select_directory() -> Result<Option<String>, String> {
    let result = rfd::FileDialog::new()
        .set_title("Pilih Folder Proyek")
        .pick_folder();
    
    Ok(result.map(|path| path.to_string_lossy().to_string()))
}

#[derive(Clone, serde::Serialize)]
struct VirtualHostInfo {
    domain: String,
    document_root: String,
    is_node: bool,
    node_port: Option<u16>,
}

#[tauri::command]
fn get_virtual_hosts() -> Result<Vec<VirtualHostInfo>, String> {
    let vhosts_path = Path::new("C:\\server\\Apache24\\conf\\extra\\httpd-vhosts.conf");
    if !vhosts_path.exists() {
        return Ok(Vec::new());
    }

    let content = fs::read_to_string(vhosts_path)
        .map_err(|e| format!("Gagal membaca httpd-vhosts.conf: {}", e))?;

    let mut hosts = Vec::new();
    let mut current_domain = String::new();
    let mut current_doc_root = String::new();
    let mut current_is_node = false;
    let mut current_node_port = None;
    let mut in_vhost = false;

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.to_lowercase().starts_with("<virtualhost") {
            in_vhost = true;
            current_domain.clear();
            current_doc_root.clear();
            current_is_node = false;
            current_node_port = None;
        } else if trimmed.to_lowercase().starts_with("</virtualhost>") {
            if in_vhost && !current_domain.is_empty() {
                hosts.push(VirtualHostInfo {
                    domain: current_domain.clone(),
                    document_root: current_doc_root.clone(),
                    is_node: current_is_node,
                    node_port: current_node_port,
                });
            }
            in_vhost = false;
        } else if in_vhost {
            let lower = trimmed.to_lowercase();
            if lower.starts_with("servername") {
                current_domain = trimmed["servername".len()..].trim().to_string();
            } else if lower.starts_with("documentroot") {
                let path_with_quotes = trimmed["documentroot".len()..].trim();
                current_doc_root = path_with_quotes.trim_matches('"').trim_matches('\'').to_string();
            } else if lower.starts_with("proxypass") && lower.contains("http://localhost:") {
                current_is_node = true;
                if let Some(pos) = lower.find("localhost:") {
                    let port_str: String = lower[pos + "localhost:".len()..]
                        .chars()
                        .take_while(|c| c.is_numeric())
                        .collect();
                    if let Ok(port) = port_str.parse::<u16>() {
                        current_node_port = Some(port);
                    }
                }
            }
        }
    }

    Ok(hosts)
}

#[tauri::command]
fn open_in_browser(app: tauri::AppHandle, url: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener().open_url(url, None::<&str>)
        .map_err(|e| format!("Gagal membuka browser: {}", e))
}

#[tauri::command]
fn close_splashscreen(app: tauri::AppHandle) {
    use tauri::Manager;
    if let Some(splashscreen) = app.get_webview_window("splashscreen") {
        let _ = splashscreen.close();
    }
    if let Some(main_window) = app.get_webview_window("main") {
        let _ = main_window.show();
        let _ = main_window.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            greet, 
            check_and_init_environment,
            check_directories_exist,
            download_and_extract,
            check_service_installed,
            control_service,
            install_service,
            ping_port,
            add_project,
            switch_php_version,
            get_nvm_versions,
            switch_node_version,
            select_directory,
            get_active_php_version,
            get_virtual_hosts,
            open_in_browser,
            delete_project,
            install_node_version,
            install_nvm,
            close_splashscreen
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
