use std::fs;
use crate::config::get_server_dir_path;

#[tauri::command]
pub fn check_service_installed(service: String) -> Result<bool, String> {
    if service == "mailpit" {
        let server_dir = get_server_dir_path();
        let mailpit_exe = server_dir.join("mailpit").join("mailpit.exe");
        return Ok(mailpit_exe.exists());
    }

    let output = crate::create_hidden_command("sc")
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

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct ServiceStatus {
    pub name: String,
    pub installed: bool,
    pub running: bool,
    pub port_conflict: bool,
    pub path_conflict: bool,
    pub conflict_pid: Option<u32>,
    pub conflict_process: Option<String>,
    pub port: Option<u16>,
}

fn is_service_running(service_name: &str) -> bool {
    let output = crate::create_hidden_command("sc")
        .args(&["query", service_name])
        .output();
    if let Ok(out) = output {
        let stdout = String::from_utf8_lossy(&out.stdout);
        stdout.contains("STATE") && stdout.contains("RUNNING")
    } else {
        false
    }
}

fn get_service_image_path(service_name: &str) -> Option<String> {
    let output = crate::create_hidden_command("sc")
        .args(&["qc", service_name])
        .output()
        .ok()?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    for line in stdout.lines() {
        if line.contains("BINARY_PATH_NAME") {
            let parts: Vec<&str> = line.splitn(2, ':').collect();
            if parts.len() > 1 {
                return Some(parts[1].trim().to_string());
            }
        }
    }
    None
}

pub fn is_port_in_use(port: u16) -> bool {
    use std::net::{TcpStream, ToSocketAddrs};
    use std::time::Duration;
    let addr = format!("127.0.0.1:{}", port);
    if let Ok(mut addrs) = addr.to_socket_addrs() {
        if let Some(sockaddr) = addrs.next() {
            return TcpStream::connect_timeout(&sockaddr, Duration::from_millis(150)).is_ok();
        }
    }
    false
}

pub fn find_port_owner(port: u16) -> Option<(u32, String)> {
    let output = crate::create_hidden_command("netstat")
        .args(&["-ano"])
        .output()
        .ok()?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    
    let target_port_pattern = format!(":{}", port);
    let mut matching_pid = None;
    
    for line in stdout.lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 5 && (parts[0] == "TCP" || parts[0] == "UDP") {
            let local_addr = parts[1];
            if local_addr.ends_with(&target_port_pattern) {
                let actual_port_str = local_addr.split(':').last().unwrap_or("");
                if actual_port_str == port.to_string() {
                    if let Ok(pid) = parts[parts.len() - 1].parse::<u32>() {
                        matching_pid = Some(pid);
                        break;
                    }
                }
            }
        }
    }
    
    let pid = matching_pid?;
    if pid == 0 {
        return Some((0, "System Idle Process".to_string()));
    }
    if pid == 4 {
        return Some((4, "System".to_string()));
    }
    
    let output_wmic = crate::create_hidden_command("wmic")
        .args(&["process", "where", &format!("processid={}", pid), "get", "ExecutablePath", "/format:csv"])
        .output()
        .ok()?;
    let stdout_wmic = String::from_utf8_lossy(&output_wmic.stdout);
    for line in stdout_wmic.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.contains("Node,ExecutablePath") {
            continue;
        }
        let parts: Vec<&str> = trimmed.split(',').collect();
        if parts.len() >= 2 {
            let path = parts[1].trim().to_string();
            if !path.is_empty() {
                return Some((pid, path));
            }
        }
    }

    let output_task = crate::create_hidden_command("tasklist")
        .args(&["/FI", &format!("PID eq {}", pid), "/FO", "CSV", "/NH"])
        .output()
        .ok()?;
    let stdout_task = String::from_utf8_lossy(&output_task.stdout);
    for line in stdout_task.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let parts: Vec<&str> = trimmed.split(',').collect();
        if parts.len() > 0 {
            let name = parts[0].replace('"', "");
            if !name.is_empty() {
                return Some((pid, name));
            }
        }
    }
    
    Some((pid, format!("PID {}", pid)))
}

#[tauri::command]
pub fn get_detailed_services_status() -> Result<Vec<ServiceStatus>, String> {
    let mut statuses = Vec::new();
    
    let services_to_check = vec![
        ("Apache", "Apache2.4", 80),
        ("MySQL", "mysql-server", 3306),
        ("Redis", "redis-server", 6379),
        ("Mailpit", "mailpit", 8025),
    ];
    
    let server_dir = get_server_dir_path();
    let server_dir_str = server_dir.to_string_lossy().to_lowercase();
    
    for (key, service_name, port) in services_to_check {
        let mut running = false;
        let mut port_conflict = false;
        let mut path_conflict = false;
        let mut conflict_pid = None;
        let mut conflict_process = None;
        
        let installed = if key == "Mailpit" {
            let mailpit_exe = server_dir.join("mailpit").join("mailpit.exe");
            mailpit_exe.exists()
        } else {
            check_service_installed(service_name.to_string()).unwrap_or(false)
        };
        
        if key == "Mailpit" {
            if is_port_in_use(port) {
                if let Some((pid, proc_path)) = find_port_owner(port) {
                    let proc_path_lower = proc_path.to_lowercase();
                    if !proc_path_lower.contains("mailpit.exe") || !proc_path_lower.contains(&server_dir_str) {
                        port_conflict = true;
                        conflict_pid = Some(pid);
                        conflict_process = Some(proc_path);
                    } else {
                        running = true;
                    }
                } else {
                    running = true;
                }
            }
        } else {
            if installed {
                if let Some(img_path) = get_service_image_path(service_name) {
                    let img_path_lower = img_path.to_lowercase();
                    if !img_path_lower.contains(&server_dir_str) {
                        path_conflict = true;
                        conflict_process = Some(img_path);
                    }
                }
                
                running = is_service_running(service_name);
            }
            
            if is_port_in_use(port) {
                if let Some((pid, proc_path)) = find_port_owner(port) {
                    let proc_path_lower = proc_path.to_lowercase();
                    
                    let is_our_proc = match key {
                        "Apache" => proc_path_lower.contains("httpd.exe") && proc_path_lower.contains(&server_dir_str),
                        "MySQL" => proc_path_lower.contains("mysqld.exe") && proc_path_lower.contains(&server_dir_str),
                        "Redis" => (proc_path_lower.contains("redis-server.exe") || proc_path_lower.contains("redis-server")) && proc_path_lower.contains(&server_dir_str),
                        _ => false,
                    };
                    
                    if !is_our_proc {
                        port_conflict = true;
                        conflict_pid = Some(pid);
                        conflict_process = Some(proc_path);
                    } else {
                        running = true;
                    }
                } else {
                    if !running {
                        port_conflict = true;
                    }
                }
            }
        }
        
        statuses.push(ServiceStatus {
            name: key.to_string(),
            installed,
            running,
            port_conflict,
            path_conflict,
            conflict_pid,
            conflict_process,
            port: Some(port),
        });
    }
    
    Ok(statuses)
}

#[tauri::command]
pub fn control_service(service: String, action: String) -> Result<String, String> {
    if action == "start" {
        let port = match service.as_str() {
            "Apache2.4" => Some(80),
            "mysql-server" => Some(3306),
            "redis-server" => Some(6379),
            "mailpit" => Some(8025),
            _ => None,
        };

        if let Some(p) = port {
            if is_port_in_use(p) {
                if let Some((pid, proc_path)) = find_port_owner(p) {
                    let server_dir = get_server_dir_path().to_string_lossy().to_lowercase();
                    let proc_path_lower = proc_path.to_lowercase();
                    
                    let is_our_proc = match service.as_str() {
                        "Apache2.4" => proc_path_lower.contains("httpd.exe") && proc_path_lower.contains(&server_dir),
                        "mysql-server" => proc_path_lower.contains("mysqld.exe") && proc_path_lower.contains(&server_dir),
                        "redis-server" => (proc_path_lower.contains("redis-server.exe") || proc_path_lower.contains("redis-server")) && proc_path_lower.contains(&server_dir),
                        "mailpit" => proc_path_lower.contains("mailpit.exe") && proc_path_lower.contains(&server_dir),
                        _ => false,
                    };

                    if !is_our_proc {
                        return Err(format!(
                            "Gagal memulai: Port {} sudah digunakan oleh PID {} ({}) yang bukan bagian dari Envku. Silakan matikan aplikasi tersebut terlebih dahulu.",
                            p, pid, proc_path
                        ));
                    }
                } else {
                    return Err(format!(
                        "Gagal memulai: Port {} sudah digunakan oleh aplikasi lain. Silakan matikan aplikasi tersebut terlebih dahulu.",
                        p
                    ));
                }
            }
        }
    }

    if service == "mailpit" {
        if action == "start" {
            let server_dir = get_server_dir_path();
            let mailpit_exe = server_dir.join("mailpit").join("mailpit.exe");
            if !mailpit_exe.exists() {
                return Err("Mailpit tidak terinstal.".to_string());
            }
            let mut cmd = crate::create_hidden_command(&mailpit_exe.to_string_lossy());
            cmd.spawn().map_err(|e| format!("Gagal menjalankan Mailpit: {}", e))?;
            std::thread::sleep(std::time::Duration::from_millis(500));
            return Ok("Layanan Mail Sandbox (Mailpit) berhasil dijalankan".to_string());
        } else if action == "stop" {
            let output = crate::create_hidden_command("taskkill")
                .args(&["/F", "/IM", "mailpit.exe"])
                .output();
            if output.is_ok() {
                return Ok("Layanan Mail Sandbox (Mailpit) berhasil dihentikan".to_string());
            } else {
                return Err("Gagal menghentikan Mailpit.".to_string());
            }
        } else {
            return Err("Aksi tidak valid (gunakan start/stop)".to_string());
        }
    }

    let action_arg = match action.as_str() {
        "start" => "start",
        "stop" => "stop",
        _ => return Err("Aksi tidak valid (gunakan start/stop)".to_string()),
    };

    let output = crate::create_hidden_command("net")
        .args(&[action_arg, &service])
        .output()
        .map_err(|e| format!("Gagal mengontrol service: {}", e))?;

    if output.status.success() {
        if service == "mysql-server" && action == "start" {
            std::thread::sleep(std::time::Duration::from_millis(1500));

            let sql_path = get_server_dir_path().join("www").join("phpmyadmin").join("sql").join("create_tables.sql");
            if sql_path.exists() {
                let mysql_exe = get_server_dir_path().join("mysql").join("bin").join("mysql.exe");
                let source_arg = format!("source {}", sql_path.to_string_lossy());
                let _ = crate::create_hidden_command(&mysql_exe.to_string_lossy())
                    .args(&["-u", "root", "-e", &source_arg])
                    .output();
            }
        }
        if service == "redis-server" && action == "start" {
            std::thread::sleep(std::time::Duration::from_millis(1000));
            let _ = clear_redis_cache();
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
pub fn install_service(service: String) -> Result<String, String> {
    let server_dir = get_server_dir_path();
    if service == "Apache2.4" {
        let apache_exe = server_dir.join("Apache24").join("bin").join("httpd.exe");
        let output = crate::create_hidden_command(&apache_exe.to_string_lossy())
            .args(&["-k", "install", "-n", "Apache2.4"])
            .output()
            .map_err(|e| format!("Gagal menginstal service Apache: {}", e))?;
        if output.status.success() {
            Ok("Service Apache2.4 berhasil diinstal".to_string())
        } else {
            Err(String::from_utf8_lossy(&output.stderr).to_string())
        }
    } else if service == "mysql-server" {
        let mysql_dir = server_dir.join("mysql");
        let my_ini_path = mysql_dir.join("my.ini");
        if !my_ini_path.exists() {
            let mysql_dir_slash = mysql_dir.to_string_lossy().replace('\\', "/");
            let config = format!(r#"[mysqld]
basedir={}
datadir={}/data
port=3306
character-set-server=utf8mb4
default-storage-engine=INNODB
sql_mode=NO_ENGINE_SUBSTITUTION
default_authentication_plugin=mysql_native_password
"#, mysql_dir_slash, mysql_dir_slash);
            fs::write(&my_ini_path, config)
                .map_err(|e| format!("Gagal menulis my.ini: {}", e))?;
        }

        let data_dir = mysql_dir.join("data");
        if !data_dir.exists() {
            // Insecure initialization of datadir (creates root@localhost with empty password)
            let mysqld_exe = mysql_dir.join("bin").join("mysqld.exe");
            let _ = crate::create_hidden_command(&mysqld_exe.to_string_lossy())
                .args(&["--initialize-insecure", "--user=mysql"])
                .output();
        }

        // Delete existing service if any to avoid collision or wrong executable paths
        let _ = crate::create_hidden_command("sc")
            .args(&["delete", "mysql-server"])
            .output();

        let mysqld_exe = mysql_dir.join("bin").join("mysqld.exe");
        let defaults_arg = format!("--defaults-file={}", my_ini_path.to_string_lossy());
        let output = crate::create_hidden_command(&mysqld_exe.to_string_lossy())
            .args(&["--install", "mysql-server", &defaults_arg])
            .output()
            .map_err(|e| format!("Gagal menginstal service MySQL: {}", e))?;
        if output.status.success() {
            Ok("Service mysql-server berhasil diinstal".to_string())
        } else {
            Err(String::from_utf8_lossy(&output.stderr).to_string())
        }
    } else if service == "redis-server" {
        let redis_dir = server_dir.join("redis");
        let redis_exe = redis_dir.join("redis-server.exe");
        let conf_path = redis_dir.join("redis.windows.conf");

        if !redis_exe.exists() {
            return Err("Redis tidak terinstal di folder server.".to_string());
        }

        // Delete existing service if any to avoid collision
        let _ = crate::create_hidden_command("sc")
            .args(&["delete", "redis-server"])
            .output();

        let output = crate::create_hidden_command(&redis_exe.to_string_lossy())
            .args(&[
                "--service-install",
                &conf_path.to_string_lossy(),
                "--service-name",
                "redis-server"
            ])
            .output()
            .map_err(|e| format!("Gagal menginstal service Redis: {}", e))?;

        if output.status.success() {
            Ok("Service redis-server berhasil diinstal".to_string())
        } else {
            Err(String::from_utf8_lossy(&output.stderr).to_string())
        }
    } else {
        Err(format!("Service {} tidak dikenal untuk diinstal", service))
    }
}

#[tauri::command]
pub fn ping_port(port: u16) -> bool {
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

#[tauri::command]
pub fn clear_redis_cache() -> Result<String, String> {
    let server_dir = get_server_dir_path();
    let redis_cli = server_dir.join("redis").join("redis-cli.exe");

    if !redis_cli.exists() {
        return Err("Redis-cli tidak ditemukan. Pastikan Redis sudah terinstal.".to_string());
    }

    let output = crate::create_hidden_command(&redis_cli.to_string_lossy())
        .arg("FLUSHALL")
        .output()
        .map_err(|e| format!("Gagal menjalankan redis-cli: {}", e))?;

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        Ok(format!("Redis cache berhasil dibersihkan: {}", stdout.trim()))
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        Err(format!(
            "Gagal membersihkan Redis cache. Stderr: {}. Stdout: {}",
            stderr.trim(),
            stdout.trim()
        ))
    }
}
