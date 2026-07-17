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
pub fn add_project(domain: String, document_root: String, is_node: bool, node_port: Option<u16>, enable_ssl: bool) -> Result<String, String> {
    let server_dir = get_server_dir_path();
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
    if enable_ssl {
        if !ssl_dir.exists() {
            fs::create_dir_all(&ssl_dir).map_err(|e| format!("Gagal membuat folder SSL: {}", e))?;
        }

        let key_path = ssl_dir.join(format!("{}.key", domain));
        let crt_path = ssl_dir.join(format!("{}.crt", domain));

        #[cfg(target_os = "windows")]
        {
            let openssl_exe = server_dir.join("Apache24").join("bin").join("openssl.exe");
            if openssl_exe.exists() {
                let subj_arg = format!("/CN={}", domain);
                let output = crate::create_hidden_command(&openssl_exe.to_string_lossy())
                    .args(&[
                        "req", "-x509", "-nodes", "-days", "365",
                        "-newkey", "rsa:2048",
                        "-keyout", &key_path.to_string_lossy(),
                        "-out", &crt_path.to_string_lossy(),
                        "-subj", &subj_arg
                    ])
                    .output();

                if let Ok(out) = output {
                    if !out.status.success() {
                        let stderr = String::from_utf8_lossy(&out.stderr);
                        return Err(format!("Gagal membuat sertifikat SSL: {}", stderr));
                    }
                } else {
                    return Err("Gagal mengeksekusi openssl.exe".to_string());
                }

                // Trust the certificate globally in Windows Trusted Root store
                let _ = crate::create_hidden_command("certutil")
                    .args(&["-addstore", "-user", "root", &crt_path.to_string_lossy()])
                    .output();
            } else {
                return Err("openssl.exe tidak ditemukan di folder Apache. Pastikan Apache sudah terinstal.".to_string());
            }
        }

        #[cfg(target_os = "linux")]
        {
            let subj_arg = format!("/CN={}", domain);
            let output = std::process::Command::new("openssl")
                .args(&[
                    "req", "-x509", "-nodes", "-days", "365",
                    "-newkey", "rsa:2048",
                    "-keyout", &key_path.to_string_lossy(),
                    "-out", &crt_path.to_string_lossy(),
                    "-subj", &subj_arg
                ])
                .output();

            match output {
                Ok(out) => {
                    if !out.status.success() {
                        let stderr = String::from_utf8_lossy(&out.stderr);
                        return Err(format!("Gagal membuat sertifikat SSL: {}", stderr));
                    }
                }
                Err(e) => {
                    return Err(format!("openssl tidak ditemukan di sistem atau gagal dijalankan: {}", e));
                }
            }

            // Trust the certificate globally in Linux (Debian/Ubuntu)
            let dest_cert_path = format!("/usr/local/share/ca-certificates/{}.crt", domain);
            let cmd_str = format!("cp {} {} && update-ca-certificates", crt_path.to_string_lossy(), dest_cert_path);
            let _ = crate::execute_elevated_command(&["sh", "-c", &cmd_str]);
        }

        #[cfg(not(any(target_os = "windows", target_os = "linux")))]
        {
            let _ = (key_path, crt_path);
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

        if enable_ssl {
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

    Ok(format!("Proyek {} berhasil dibuat & didaftarkan.", domain))
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

    // 3. Restart Apache to apply changes
    let _ = crate::commands::services::control_service("Apache2.4".to_string(), "stop".to_string());
    let _ = crate::commands::services::control_service("Apache2.4".to_string(), "start".to_string());

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

#[tauri::command]
pub fn get_virtual_hosts() -> Result<Vec<VirtualHostInfo>, String> {
    let server_dir = get_server_dir_path();
    let vhosts_path = server_dir.join("Apache24").join("conf").join("extra").join("httpd-vhosts.conf");
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
                let crt_exists = server_dir.join("ssl").join(format!("{}.crt", current_domain)).exists();
                let exists_idx = hosts.iter().position(|h: &VirtualHostInfo| h.domain == current_domain);
                if let Some(idx) = exists_idx {
                    if crt_exists {
                        hosts[idx].has_ssl = true;
                    }
                } else {
                    hosts.push(VirtualHostInfo {
                        domain: current_domain.clone(),
                        document_root: current_doc_root.clone(),
                        is_node: current_is_node,
                        node_port: current_node_port,
                        has_ssl: crt_exists,
                    });
                }
            }
            in_vhost = false;
        } else if in_vhost {
            let lower = trimmed.to_lowercase();
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
