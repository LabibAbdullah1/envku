use std::fs;
use crate::config::get_server_dir_path;

#[derive(Clone, serde::Serialize, serde::Deserialize)]
pub struct VirtualHostInfo {
    pub domain: String,
    pub document_root: String,
    pub is_node: bool,
    pub node_port: Option<u16>,
    pub has_ssl: bool,
}

#[tauri::command]
pub async fn create_laravel_project(
    project_name: String,
    domain: String,
    parent_dir: String,
    enable_ssl: bool,
) -> Result<String, String> {
    let server_dir = get_server_dir_path();
    let composer_phar = server_dir.join("composer").join("composer.phar");
    
    let active_php = crate::commands::php::get_active_php_version().unwrap_or_default();
    let candidate_versions = if active_php != "unknown" && !active_php.is_empty() {
        vec![active_php.clone(), "php85".to_string(), "php84".to_string(), "php83".to_string(), "php82".to_string()]
    } else {
        vec!["php85".to_string(), "php84".to_string(), "php83".to_string(), "php82".to_string()]
    };

    let mut selected_php_exe = None;
    for ver in candidate_versions {
        let exe = if cfg!(target_os = "windows") {
            server_dir.join(&ver).join("php.exe")
        } else {
            server_dir.join(&ver).join("bin").join("php")
        };
        if exe.exists() {
            selected_php_exe = Some(exe);
            break;
        }
    }

    let php_exe = match selected_php_exe {
        Some(exe) => exe,
        None => {
            return Err("Biner PHP tidak ditemukan. Silakan unduh PHP 8.5 / 8.4 / 8.3 di Katalog Komponen terlebih dahulu.".to_string());
        }
    };

    if !composer_phar.exists() {
        return Err("PHP Composer tidak ditemukan. Silakan unduh PHP Composer di Katalog Komponen terlebih dahulu.".to_string());
    }

    let parent_path = std::path::PathBuf::from(&parent_dir);
    if !parent_path.exists() {
        return Err(format!("Folder induk {} tidak ditemukan.", parent_dir));
    }

    let clean_name = project_name.trim().to_string();
    let project_dir = parent_path.join(&clean_name);
    if project_dir.exists() {
        return Err(format!("Folder {} sudah ada di {}.", clean_name, parent_dir));
    }

    let output = if cfg!(target_os = "windows") {
        crate::create_hidden_command(&php_exe.to_string_lossy())
            .args(&[
                composer_phar.to_string_lossy().as_ref(),
                "create-project",
                "laravel/laravel",
                &clean_name,
                "--prefer-dist",
            ])
            .current_dir(&parent_path)
            .output()
    } else {
        std::process::Command::new(&php_exe)
            .args(&[
                composer_phar.to_string_lossy().as_ref(),
                "create-project",
                "laravel/laravel",
                &clean_name,
                "--prefer-dist",
            ])
            .current_dir(&parent_path)
            .output()
    }.map_err(|e| format!("Gagal mengeksekusi Composer: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Err(format!("Gagal membuat proyek Laravel: {}\n{}", stderr.trim(), stdout.trim()));
    }

    let doc_root = project_dir.join("public").to_string_lossy().to_string();
    add_project(domain.clone(), doc_root, false, None, enable_ssl)?;

    Ok(format!("Proyek Laravel {} versi terbaru berhasil dibuat dan terdaftar di http://{}", clean_name, domain))
}

#[tauri::command]
pub fn add_project(domain: String, document_root: String, is_node: bool, node_port: Option<u16>, enable_ssl: bool) -> Result<String, String> {
    let server_dir = get_server_dir_path();
    
    #[cfg(target_os = "linux")]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(metadata) = fs::metadata(&document_root) {
            let mut perms = metadata.permissions();
            perms.set_mode(0o755);
            let _ = fs::set_permissions(&document_root, perms);
        }
    }

    // Cegah registrasi proyek atau pemanggilan restart Apache jika Apache belum terinstal
    let is_apache_downloaded = if cfg!(target_os = "windows") {
        server_dir.join("Apache24").exists()
    } else {
        server_dir.join("Apache24").exists() && server_dir.join("config").join("apache2.conf").exists()
    };

    if !is_apache_downloaded {
        return Err("Apache belum terinstal. Silakan pasang Apache terlebih dahulu sebelum menambahkan proyek.".to_string());
    }

    // Ensure rewrite_module is enabled in httpd.conf
    let httpd_conf_path = server_dir.join("Apache24").join("conf").join("httpd.conf");
    if httpd_conf_path.exists() {
        if let Ok(mut conf_content) = fs::read_to_string(&httpd_conf_path) {
            if conf_content.contains("#LoadModule rewrite_module") || conf_content.contains("# LoadModule rewrite_module") {
                conf_content = conf_content.replace(
                    "#LoadModule rewrite_module modules/mod_rewrite.so",
                    "LoadModule rewrite_module modules/mod_rewrite.so",
                );
                conf_content = conf_content.replace(
                    "# LoadModule rewrite_module modules/mod_rewrite.so",
                    "LoadModule rewrite_module modules/mod_rewrite.so",
                );
                let _ = fs::write(&httpd_conf_path, conf_content);
            }
        }
    }

    let vhosts_path = server_dir.join("Apache24").join("conf").join("extra").join("httpd-vhosts.conf");
    
    // Check if virtual host already exists
    let mut vhost_exists = false;
    if vhosts_path.exists() {
        if let Ok(vhosts_content) = fs::read_to_string(&vhosts_path) {
            vhost_exists = vhosts_content.contains(&format!("ServerName {}", domain));
        }
    }
    
    // Check if host entry already exists
    let mut hosts_exists = false;
    if let Ok(hosts_content) = crate::platform::hosts::read_hosts() {
        hosts_exists = hosts_content.lines().any(|line| {
            let clean = line.trim();
            !clean.starts_with('#') && clean.contains(&domain)
        });
    }

    // Skip registration and Apache restart if already fully configured
    if vhost_exists && hosts_exists {
        return Ok(format!("Proyek {} sudah terdaftar dan terkonfigurasi.", domain));
    }

    // 1. Hosts file modification
    crate::platform::hosts::add_host_entry(&domain, "127.0.0.1")?;

    // 2. SSL Certificate Generation & Trust (if enabled)
    let server_dir = get_server_dir_path();
    let ssl_dir = server_dir.join("ssl");
    let mut actual_ssl_enabled = enable_ssl;
    let mut ssl_warning_msg: Option<String> = None;

    if enable_ssl {
        if !ssl_dir.exists() {
            if let Err(e) = fs::create_dir_all(&ssl_dir) {
                actual_ssl_enabled = false;
                ssl_warning_msg = Some(format!("Gagal membuat folder SSL ({}), proyek dibuat tanpa SSL.", e));
            }
        }

        if actual_ssl_enabled {
            let key_path = ssl_dir.join(format!("{}.key", domain));
            let crt_path = ssl_dir.join(format!("{}.crt", domain));
            let cnf_path = ssl_dir.join(format!("{}_openssl.cnf", domain));

            let cnf_content = format!(
                r#"[ req ]
default_bits        = 2048
distinguished_name  = req_distinguished_name
req_extensions      = v3_req
x509_extensions     = v3_req
prompt              = no

[ req_distinguished_name ]
CN                  = {domain}

[ v3_req ]
keyUsage            = critical, digitalSignature, keyEncipherment
extendedKeyUsage    = serverAuth
subjectAltName      = @alt_names

[ alt_names ]
DNS.1               = {domain}
DNS.2               = *.{domain}
"#,
                domain = domain
            );

            if let Err(e) = fs::write(&cnf_path, &cnf_content) {
                actual_ssl_enabled = false;
                ssl_warning_msg = Some(format!("Gagal membuat file konfigurasi SSL ({}), proyek dibuat tanpa SSL.", e));
            } else {
                #[cfg(target_os = "windows")]
                {
                    let openssl_exe = server_dir.join("Apache24").join("bin").join("openssl.exe");
                    if openssl_exe.exists() {
                        let output = crate::create_hidden_command(&openssl_exe.to_string_lossy())
                            .args(&[
                                "req", "-x509", "-nodes", "-days", "365",
                                "-newkey", "rsa:2048",
                                "-keyout", &key_path.to_string_lossy(),
                                "-out", &crt_path.to_string_lossy(),
                                "-config", &cnf_path.to_string_lossy()
                            ])
                            .output();

                        if let Ok(out) = output {
                            if out.status.success() {
                                // Trust the certificate globally in Windows Trusted Root store
                                let certutil_output = crate::create_hidden_command("certutil")
                                    .args(&["-addstore", "-user", "root", &crt_path.to_string_lossy()])
                                    .output();

                                let cert_success = match certutil_output {
                                    Ok(cout) => cout.status.success(),
                                    Err(_) => false,
                                };

                                if !cert_success {
                                    actual_ssl_enabled = false;
                                    ssl_warning_msg = Some("Penginstalan sertifikat SSL dibatalkan pengguna. Proyek tetap dibuat tanpa SSL (HTTP).".to_string());
                                    let _ = fs::remove_file(&crt_path);
                                    let _ = fs::remove_file(&key_path);
                                }
                            } else {
                                let stderr = String::from_utf8_lossy(&out.stderr);
                                actual_ssl_enabled = false;
                                ssl_warning_msg = Some(format!("Gagal membuat sertifikat SSL ({}), proyek dibuat tanpa SSL.", stderr.trim()));
                            }
                        } else {
                            actual_ssl_enabled = false;
                            ssl_warning_msg = Some("Gagal mengeksekusi openssl.exe, proyek dibuat tanpa SSL.".to_string());
                        }
                    } else {
                        actual_ssl_enabled = false;
                        ssl_warning_msg = Some("openssl.exe tidak ditemukan di folder Apache, proyek dibuat tanpa SSL.".to_string());
                    }

                    let _ = fs::remove_file(&cnf_path);
                }

                #[cfg(target_os = "linux")]
                {
                    let output = std::process::Command::new("openssl")
                        .args(&[
                            "req", "-x509", "-nodes", "-days", "365",
                            "-newkey", "rsa:2048",
                            "-keyout", &key_path.to_string_lossy(),
                            "-out", &crt_path.to_string_lossy(),
                            "-config", &cnf_path.to_string_lossy()
                        ])
                        .output();

                    let _ = fs::remove_file(&cnf_path);

                    let openssl_ok = match output {
                        Ok(out) => out.status.success(),
                        Err(_) => false,
                    };

                    if openssl_ok {
                        let dest_cert_path = format!("/usr/local/share/ca-certificates/{}.crt", domain);
                        let cmd_str = format!("cp {} {} && update-ca-certificates", crt_path.to_string_lossy(), dest_cert_path);
                        let cert_res = crate::execute_elevated_command(&["sh", "-c", &cmd_str]);
                        if let Ok(out) = cert_res {
                            if !out.status.success() {
                                actual_ssl_enabled = false;
                                ssl_warning_msg = Some("Penginstalan sertifikat SSL dibatalkan di Linux. Proyek tetap dibuat tanpa SSL (HTTP).".to_string());
                                let _ = fs::remove_file(&crt_path);
                                let _ = fs::remove_file(&key_path);
                            }
                        } else {
                            actual_ssl_enabled = false;
                            ssl_warning_msg = Some("Gagal mendaftarkan sertifikat SSL di Linux. Proyek dibuat tanpa SSL (HTTP).".to_string());
                        }
                    } else {
                        actual_ssl_enabled = false;
                        ssl_warning_msg = Some("openssl tidak ditemukan di Linux, proyek dibuat tanpa SSL.".to_string());
                    }
                }
            }
        }
    }

    // 3. Vhosts config update
    let vhosts_path = server_dir.join("Apache24").join("conf").join("extra").join("httpd-vhosts.conf");
    if !vhosts_path.exists() {
        if let Some(parent) = vhosts_path.parent() {
            fs::create_dir_all(parent).unwrap_or(());
        }
        fs::write(&vhosts_path, "").unwrap_or(());
    }

    let mut vhosts_content = fs::read_to_string(&vhosts_path)
        .map_err(|e| format!("Gagal membaca httpd-vhosts.conf: {}", e))?;

    let vhost_exists = vhosts_content.contains(&format!("ServerName {}", domain));

    if !vhost_exists {
        let mut vhost_block = if is_node {
            let port = node_port.unwrap_or(3000);
            format!(
                r#"
<VirtualHost *:80>
    ServerName {}
    ProxyPreserveHost On
    ProxyPass / http://127.0.0.1:{}/
    ProxyPassReverse / http://127.0.0.1:{}/
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

        if actual_ssl_enabled {
            let clean_ssl_dir = ssl_dir.to_string_lossy().replace('\\', "/");
            let ssl_block = if is_node {
                let port = node_port.unwrap_or(3000);
                format!(
                    r#"
<VirtualHost *:443>
    ServerName {}
    SSLEngine on
    SSLCertificateFile "{}/{}.crt"
    SSLCertificateKeyFile "{}/{}.key"
    ProxyPreserveHost On
    ProxyPass / http://127.0.0.1:{}/
    ProxyPassReverse / http://127.0.0.1:{}/
</VirtualHost>
"#,
                    domain, clean_ssl_dir, domain, clean_ssl_dir, domain, port, port
                )
            } else {
                let clean_doc_root = document_root.replace('\\', "/");
                format!(
                    r#"
<VirtualHost *:443>
    DocumentRoot "{}"
    ServerName {}
    SSLEngine on
    SSLCertificateFile "{}/{}.crt"
    SSLCertificateKeyFile "{}/{}.key"
    <Directory "{}">
        Options Indexes FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>
</VirtualHost>
"#,
                    clean_doc_root, domain, clean_ssl_dir, domain, clean_ssl_dir, domain, clean_doc_root
                )
            };
            vhost_block.push_str(&ssl_block);
        }

        if !vhosts_content.ends_with('\n') {
            vhosts_content.push('\n');
        }
        vhosts_content.push_str(&vhost_block);
        fs::write(&vhosts_path, &vhosts_content)
            .map_err(|e| format!("Gagal menulis httpd-vhosts.conf: {}", e))?;
    }

    // 3. Restart Apache to apply changes
    let _ = crate::commands::services::control_service("Apache2.4".to_string(), "stop".to_string());
    let _ = crate::commands::services::control_service("Apache2.4".to_string(), "start".to_string());

    if let Some(warning) = ssl_warning_msg {
        Ok(format!("Proyek {} berhasil dibuat. ⚠️ {}", domain, warning))
    } else if actual_ssl_enabled {
        Ok(format!("Proyek {} berhasil dibuat dengan SSL (HTTPS).", domain))
    } else {
        Ok(format!("Proyek {} berhasil dibuat (tanpa SSL/HTTP).", domain))
    }
}

fn delete_project_internal(domain: &str) -> Result<(), String> {
    // 1. Remove from hosts file
    crate::platform::hosts::remove_host_entry(domain)?;

    // 2. Remove from httpd-vhosts.conf
    let server_dir = get_server_dir_path();
    let vhosts_path = server_dir.join("Apache24").join("conf").join("extra").join("httpd-vhosts.conf");
    if vhosts_path.exists() {
        let vhosts_content = fs::read_to_string(&vhosts_path)
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

        fs::write(&vhosts_path, new_content.trim_end())
            .map_err(|e| format!("Gagal menulis httpd-vhosts.conf: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
pub fn delete_project(domain: String) -> Result<String, String> {
    delete_project_internal(&domain)?;

    // 3. Restart Apache to apply changes if it is installed
    let server_dir = get_server_dir_path();
    let is_apache_downloaded = if cfg!(target_os = "windows") {
        server_dir.join("Apache24").exists()
    } else {
        server_dir.join("Apache24").exists() && server_dir.join("config").join("apache2.conf").exists()
    };

    if is_apache_downloaded {
        let _ = crate::commands::services::control_service("Apache2.4".to_string(), "stop".to_string());
        let _ = crate::commands::services::control_service("Apache2.4".to_string(), "start".to_string());
    }

    Ok(format!("Proyek {} berhasil dihapus.", domain))
}

#[tauri::command]
pub fn edit_project(
    old_domain: String,
    new_domain: String,
    document_root: String,
    is_node: bool,
    node_port: Option<u16>,
    enable_ssl: bool,
) -> Result<String, String> {
    // 1. Delete the old project config (without restarting Apache)
    delete_project_internal(&old_domain)?;

    // 2. Add the new project config (this will write config and restart Apache)
    add_project(new_domain.clone(), document_root, is_node, node_port, enable_ssl)?;

    Ok(format!("Proyek {} berhasil diperbarui.", new_domain))
}

pub fn is_dummy_domain(domain: &str) -> bool {
    let d = domain.to_lowercase();
    d.contains("dummy-host") || d == "example.com" || d.ends_with(".example.com")
}

pub fn clean_dummy_vhosts_file(vhosts_path: &std::path::Path) {
    if !vhosts_path.exists() {
        return;
    }
    if let Ok(content) = fs::read_to_string(vhosts_path) {
        if !content.contains("dummy-host") && !content.contains("example.com") {
            return;
        }

        let mut new_content = String::new();
        let mut current_block = Vec::new();
        let mut in_vhost = false;
        let mut is_dummy_block = false;

        for line in content.lines() {
            let trimmed = line.trim();
            let lower = trimmed.to_lowercase();

            if lower.starts_with("<virtualhost") {
                in_vhost = true;
                is_dummy_block = false;
                current_block.clear();
                current_block.push(line.to_string());
            } else if lower.starts_with("</virtualhost>") {
                if in_vhost {
                    current_block.push(line.to_string());
                    if !is_dummy_block {
                        new_content.push_str(&current_block.join("\n"));
                        new_content.push('\n');
                    }
                    current_block.clear();
                    in_vhost = false;
                } else {
                    new_content.push_str(line);
                    new_content.push('\n');
                }
            } else if in_vhost {
                current_block.push(line.to_string());
                if lower.contains("dummy-host") || lower.contains("example.com") {
                    is_dummy_block = true;
                }
            } else {
                new_content.push_str(line);
                new_content.push('\n');
            }
        }

        if !current_block.is_empty() && !is_dummy_block {
            new_content.push_str(&current_block.join("\n"));
            new_content.push('\n');
        }

        let _ = fs::write(vhosts_path, new_content.trim_end());
    }
}

#[tauri::command]
pub fn get_virtual_hosts() -> Result<Vec<VirtualHostInfo>, String> {
    let server_dir = get_server_dir_path();
    let vhosts_path = server_dir.join("Apache24").join("conf").join("extra").join("httpd-vhosts.conf");
    if !vhosts_path.exists() {
        return Ok(Vec::new());
    }

    clean_dummy_vhosts_file(&vhosts_path);

    let content = fs::read_to_string(&vhosts_path)
        .map_err(|e| format!("Gagal membaca httpd-vhosts.conf: {}", e))?;

    let mut hosts = Vec::new();
    let mut current_domain = String::new();
    let mut current_doc_root = String::new();
    let mut current_is_node = false;
    let mut current_node_port = None;
    let mut current_vhost_is_ssl = false;
    let mut in_vhost = false;

    for line in content.lines() {
        let trimmed = line.trim();
        let lower = trimmed.to_lowercase();

        if lower.starts_with("<virtualhost") {
            in_vhost = true;
            current_domain.clear();
            current_doc_root.clear();
            current_is_node = false;
            current_node_port = None;
            current_vhost_is_ssl = lower.contains(":443");
        } else if lower.starts_with("</virtualhost>") {
            if in_vhost && !current_domain.is_empty() && !is_dummy_domain(&current_domain) {
                let exists_idx = hosts.iter().position(|h: &VirtualHostInfo| h.domain == current_domain);
                if let Some(idx) = exists_idx {
                    if current_vhost_is_ssl {
                        hosts[idx].has_ssl = true;
                    }
                } else {
                    hosts.push(VirtualHostInfo {
                        domain: current_domain.clone(),
                        document_root: current_doc_root.clone(),
                        is_node: current_is_node,
                        node_port: current_node_port,
                        has_ssl: current_vhost_is_ssl,
                    });
                }
            }
            in_vhost = false;
        } else if in_vhost {
            if lower.contains("sslengine on") {
                current_vhost_is_ssl = true;
            }
            if lower.starts_with("servername") {
                current_domain = trimmed["servername".len()..].trim().to_string();
            } else if lower.starts_with("documentroot") {
                let path_with_quotes = trimmed["documentroot".len()..].trim();
                current_doc_root = path_with_quotes.trim_matches('"').trim_matches('\'').to_string();
            } else if lower.starts_with("proxypass") && (lower.contains("http://localhost:") || lower.contains("http://127.0.0.1:")) {
                current_is_node = true;
                let target_key = if lower.contains("localhost:") { "localhost:" } else { "127.0.0.1:" };
                if let Some(pos) = lower.find(target_key) {
                    let port_str: String = lower[pos + target_key.len()..]
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
