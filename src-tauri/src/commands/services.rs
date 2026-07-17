use crate::config::get_server_dir_path;
use std::process::Command;

fn normalize_service_name(service: &str) -> &str {
    match service {
        "Apache2.4" | "Apache" | "apache" => "apache",
        "mysql-server" | "MySQL" | "mysql" => "mysql",
        "redis-server" | "Redis" | "redis" => "redis",
        "mailpit" | "Mailpit" => "mailpit",
        _ => service,
    }
}

#[cfg(target_os = "linux")]
fn is_pid_in_systemd_service(pid: u32, service_name: &str) -> bool {
    let cgroup_path = format!("/proc/{}/cgroup", pid);
    if let Ok(content) = std::fs::read_to_string(cgroup_path) {
        let expected_service = format!("envku-{}.service", service_name);
        content.contains(&expected_service)
    } else {
        false
    }
}

#[cfg(not(target_os = "linux"))]
fn is_pid_in_systemd_service(_pid: u32, _service_name: &str) -> bool {
    false
}

#[tauri::command]
pub fn check_service_installed(service: String) -> Result<bool, String> {
    let norm = normalize_service_name(&service);
    crate::platform::services::check_service_installed(norm)
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
    #[cfg(target_os = "windows")]
    {
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
    #[cfg(target_os = "linux")]
    {
        let norm = normalize_service_name(service_name);
        let output = Command::new("systemctl")
            .args(&["is-active", &format!("envku-{}", norm)])
            .output();
        if let Ok(out) = output {
            let stdout = String::from_utf8_lossy(&out.stdout);
            stdout.trim() == "active"
        } else {
            false
        }
    }
    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    {
        let _ = service_name;
        false
    }
}

fn get_service_image_path(service_name: &str) -> Option<String> {
    #[cfg(target_os = "windows")]
    {
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
    #[cfg(target_os = "linux")]
    {
        let norm = normalize_service_name(service_name);
        Some(format!("/opt/server/{}", norm))
    }
    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    {
        let _ = service_name;
        None
    }
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

#[cfg(target_os = "windows")]
fn get_process_executable_path(pid: u32) -> Option<String> {
    // Try using wmic first as it is fast
    let output = crate::create_hidden_command("wmic")
        .args(&["process", "where", &format!("processid={}", pid), "get", "ExecutablePath", "/format:list"])
        .output()
        .ok()?;
    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines() {
            if line.to_lowercase().starts_with("executablepath=") {
                if let Some(path) = line.splitn(2, '=').nth(1) {
                    let trimmed = path.trim().to_string();
                    if !trimmed.is_empty() {
                        return Some(trimmed);
                    }
                }
            }
        }
    }
    // Fallback using PowerShell
    let output_ps = crate::create_hidden_command("powershell.exe")
        .args(&["-Command", &format!("(Get-Process -Id {} -ErrorAction SilentlyContinue).Path", pid)])
        .output()
        .ok()?;
    if output_ps.status.success() {
        let path = String::from_utf8_lossy(&output_ps.stdout).trim().to_string();
        if !path.is_empty() {
            return Some(path);
        }
    }
    None
}

pub fn find_port_owner(port: u16) -> Option<(u32, String)> {
    #[cfg(target_os = "windows")]
    {
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
        
        if let Some(full_path) = get_process_executable_path(pid) {
            return Some((pid, full_path));
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

    #[cfg(target_os = "linux")]
    {
        // 1. Try lsof -t -i:<port>
        if let Ok(output) = Command::new("lsof").args(&["-t", &format!("-i:{}", port)]).output() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            if let Some(pid_str) = stdout.lines().next() {
                if let Ok(pid) = pid_str.trim().parse::<u32>() {
                    let name = std::fs::read_to_string(format!("/proc/{}/cmdline", pid))
                        .map(|s| s.replace('\0', " ").trim().to_string())
                        .unwrap_or_else(|_| {
                            std::fs::read_to_string(format!("/proc/{}/comm", pid))
                                .map(|s| s.trim().to_string())
                                .unwrap_or_else(|_| format!("PID {}", pid))
                        });
                    return Some((pid, name));
                }
            }
        }
        
        // 2. Fallback to ss -ltnp
        if let Ok(output) = Command::new("ss").args(&["-ltnp"]).output() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let port_pattern = format!(":{}", port);
            for line in stdout.lines() {
                if line.contains(&port_pattern) {
                    if let Some(users_idx) = line.find("users:((") {
                        let sub = &line[users_idx..];
                        if let Some(pid_idx) = sub.find("pid=") {
                            let pid_str: String = sub[pid_idx + 4..]
                                .chars()
                                .take_while(|c| c.is_numeric())
                                .collect();
                            if let Ok(pid) = pid_str.parse::<u32>() {
                                let name = std::fs::read_to_string(format!("/proc/{}/cmdline", pid))
                                    .map(|s| s.replace('\0', " ").trim().to_string())
                                    .unwrap_or_else(|_| {
                                        std::fs::read_to_string(format!("/proc/{}/comm", pid))
                                            .map(|s| s.trim().to_string())
                                            .unwrap_or_else(|_| format!("PID {}", pid))
                                    });
                                return Some((pid, name));
                            }
                        }
                    }
                }
            }
        }
        None
    }

    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    {
        let _ = port;
        None
    }
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
            let exe_name = if cfg!(target_os = "windows") { "mailpit.exe" } else { "mailpit" };
            let mailpit_exe = server_dir.join("mailpit").join(exe_name);
            mailpit_exe.exists()
        } else {
            check_service_installed(service_name.to_string()).unwrap_or(false)
        };
        
        if key == "Mailpit" {
            if is_port_in_use(port) {
                if let Some((pid, proc_path)) = find_port_owner(port) {
                    let proc_path_lower = proc_path.to_lowercase();
                    let has_path_separator = proc_path_lower.contains('\\') || proc_path_lower.contains('/');
                    let is_our_mailpit = is_pid_in_systemd_service(pid, "mailpit") ||
                        ((proc_path_lower.contains("mailpit.exe") || proc_path_lower.contains("mailpit")) &&
                        (proc_path_lower.contains(&server_dir_str) || proc_path_lower.contains("/opt/server") || !has_path_separator));

                    if !is_our_mailpit {
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
                    let has_path_separator = proc_path_lower.contains('\\') || proc_path_lower.contains('/');
                    
                    let is_our_proc = match key {
                        "Apache" => {
                            is_pid_in_systemd_service(pid, "apache") ||
                            ((proc_path_lower.contains("httpd.exe") || proc_path_lower.contains("apache2") || proc_path_lower.contains("httpd")) &&
                            (proc_path_lower.contains(&server_dir_str) || proc_path_lower.contains("/opt/server") || (running && !has_path_separator)))
                        },
                        "MySQL" => {
                            is_pid_in_systemd_service(pid, "mysql") ||
                            ((proc_path_lower.contains("mysqld.exe") || proc_path_lower.contains("mysqld")) &&
                            (proc_path_lower.contains(&server_dir_str) || proc_path_lower.contains("/opt/server") || (running && !has_path_separator)))
                        },
                        "Redis" => {
                            is_pid_in_systemd_service(pid, "redis") ||
                            ((proc_path_lower.contains("redis-server.exe") || proc_path_lower.contains("redis-server")) &&
                            (proc_path_lower.contains(&server_dir_str) || proc_path_lower.contains("/opt/server") || (running && !has_path_separator)))
                        },
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
    let norm = normalize_service_name(&service);
    
    // Check conflicts on start
    if action == "start" {
        let port = match norm {
            "apache" => Some(80),
            "mysql" => Some(3306),
            "redis" => Some(6379),
            "mailpit" => Some(8025),
            _ => None,
        };

        if let Some(p) = port {
            if is_port_in_use(p) {
                if let Some((pid, proc_path)) = find_port_owner(p) {
                    let server_dir = get_server_dir_path().to_string_lossy().to_lowercase();
                    let proc_path_lower = proc_path.to_lowercase();
                    let has_path_separator = proc_path_lower.contains('\\') || proc_path_lower.contains('/');
                    
                    let running = match norm {
                        "apache" => is_service_running("Apache2.4"),
                        "mysql" => is_service_running("mysql-server"),
                        "redis" => is_service_running("redis-server"),
                        _ => false,
                    };
                    
                    let is_our_proc = match norm {
                        "apache" => {
                            is_pid_in_systemd_service(pid, "apache") ||
                            ((proc_path_lower.contains("httpd.exe") || proc_path_lower.contains("apache2") || proc_path_lower.contains("httpd")) &&
                            (proc_path_lower.contains(&server_dir) || proc_path_lower.contains("/opt/server") || (running && !has_path_separator)))
                        },
                        "mysql" => {
                            is_pid_in_systemd_service(pid, "mysql") ||
                            ((proc_path_lower.contains("mysqld.exe") || proc_path_lower.contains("mysqld")) &&
                            (proc_path_lower.contains(&server_dir) || proc_path_lower.contains("/opt/server") || (running && !has_path_separator)))
                        },
                        "redis" => {
                            is_pid_in_systemd_service(pid, "redis") ||
                            ((proc_path_lower.contains("redis-server.exe") || proc_path_lower.contains("redis-server")) &&
                            (proc_path_lower.contains(&server_dir) || proc_path_lower.contains("/opt/server") || (running && !has_path_separator)))
                        },
                        "mailpit" => {
                            is_pid_in_systemd_service(pid, "mailpit") ||
                            ((proc_path_lower.contains("mailpit.exe") || proc_path_lower.contains("mailpit")) &&
                            (proc_path_lower.contains(&server_dir) || proc_path_lower.contains("/opt/server") || !has_path_separator))
                        },
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

    let result = crate::platform::services::control_service(norm, &action)?;

    if norm == "mysql" && action == "start" {
        std::thread::sleep(std::time::Duration::from_millis(1500));

        let sql_path = get_server_dir_path().join("www").join("phpmyadmin").join("sql").join("create_tables.sql");
        if sql_path.exists() {
            let mysql_exe = if cfg!(target_os = "windows") {
                get_server_dir_path().join("mysql").join("bin").join("mysql.exe")
            } else {
                std::path::PathBuf::from("/usr/bin/mysql")
            };
            let source_arg = format!("source {}", sql_path.to_string_lossy());
            let mut cmd = Command::new(&mysql_exe);
            #[cfg(target_os = "windows")]
            {
                use std::os::windows::process::CommandExt;
                cmd.creation_flags(0x08000000);
            }
            let _ = cmd.args(&["-u", "root", "-e", &source_arg]).output();
        }
    }

    if norm == "redis" && action == "start" {
        std::thread::sleep(std::time::Duration::from_millis(1000));
        let _ = clear_redis_cache();
    }

    Ok(result)
}

#[tauri::command]
pub fn install_service(service: String) -> Result<String, String> {
    let norm = normalize_service_name(&service);
    crate::platform::services::install_service(norm)
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
    let redis_cli = if cfg!(target_os = "windows") {
        server_dir.join("redis").join("redis-cli.exe")
    } else {
        std::path::PathBuf::from("/usr/bin/redis-cli")
    };

    if !redis_cli.exists() {
        return Err("Redis-cli tidak ditemukan. Pastikan Redis sudah terinstal.".to_string());
    }

    let mut cmd = Command::new(&redis_cli);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    let output = cmd
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
