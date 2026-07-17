use std::net::TcpListener;
#[cfg(target_os = "linux")]
use std::process::Command;

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PortStatus {
    pub port: u16,
    pub available: bool,
    pub owner_pid: Option<u32>,
    pub owner_name: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
#[serde(tag = "status", content = "details", rename_all = "camelCase")]
pub enum PreFlightReport {
    Ok,
    Conflict {
        conflicts: Vec<PortStatus>,
    },
}

/// Helper function to check if a port is free by attempting to bind to localhost and wildcard.
fn check_port_available(port: u16) -> bool {
    if TcpListener::bind(("127.0.0.1", port)).is_err() {
        return false;
    }
    if TcpListener::bind(("0.0.0.0", port)).is_err() {
        return false;
    }
    true
}

/// Find the PID and process name occupying the specified port on Linux.
#[cfg(target_os = "linux")]
fn find_port_owner(port: u16) -> Option<(u32, String)> {
    // 1. Try lsof -t -i:<port> (returns only PID)
    if let Ok(output) = Command::new("lsof").args(&["-t", &format!("-i:{}", port)]).output() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        if let Some(pid_str) = stdout.lines().next() {
            if let Ok(pid) = pid_str.trim().parse::<u32>() {
                let name = std::fs::read_to_string(format!("/proc/{}/comm", pid))
                    .map(|s| s.trim().to_string())
                    .unwrap_or_else(|_| format!("PID {}", pid));
                return Some((pid, name));
            }
        }
    }
    
    // 2. Fallback to ss -ltnp (socket statistics)
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
                            let name = std::fs::read_to_string(format!("/proc/{}/comm", pid))
                                .map(|s| s.trim().to_string())
                                .unwrap_or_else(|_| format!("PID {}", pid));
                            return Some((pid, name));
                        }
                    }
                }
            }
        }
    }
    None
}

/// Find the PID and process name occupying the specified port on Windows.
#[cfg(target_os = "windows")]
fn find_port_owner(port: u16) -> Option<(u32, String)> {
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
    
    // Get process name using tasklist
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
        if !parts.is_empty() {
            let name = parts[0].replace('"', "");
            if !name.is_empty() {
                return Some((pid, name));
            }
        }
    }
    
    Some((pid, format!("PID {}", pid)))
}

/// Fallback for non-supported targets
#[cfg(not(any(target_os = "windows", target_os = "linux")))]
fn find_port_owner(_port: u16) -> Option<(u32, String)> {
    None
}

/// Tauri command to perform pre-flight checks on ports 80 and 3306.
#[tauri::command]
pub fn check_pre_flight() -> Result<PreFlightReport, String> {
    let ports_to_check = vec![80, 3306];
    let mut conflicts = Vec::new();
    
    for port in ports_to_check {
        if !check_port_available(port) {
            let (owner_pid, owner_name) = find_port_owner(port)
                .map(|(pid, name)| (Some(pid), Some(name)))
                .unwrap_or((None, None));
            
            conflicts.push(PortStatus {
                port,
                available: false,
                owner_pid,
                owner_name,
            });
        }
    }
    
    if conflicts.is_empty() {
        Ok(PreFlightReport::Ok)
    } else {
        Ok(PreFlightReport::Conflict { conflicts })
    }
}

/// Tauri command to terminate a process by PID with appropriate OS escalation if necessary.
#[tauri::command]
pub fn resolve_port_conflict(pid: u32) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        // 1. Try normal taskkill
        let output = crate::create_hidden_command("taskkill")
            .args(&["/F", "/PID", &pid.to_string()])
            .output();
            
        if let Ok(out) = output {
            if out.status.success() {
                return Ok(format!("Proses PID {} berhasil dihentikan.", pid));
            }
        }
        
        // 2. Elevate using UAC via PowerShell
        let output_elevated = crate::create_hidden_command("powershell")
            .args(&[
                "-Command",
                &format!("Start-Process taskkill -ArgumentList '/F', '/PID', '{}' -Verb RunAs -WindowStyle Hidden", pid)
            ])
            .output()
            .map_err(|e| format!("Gagal memicu UAC: {}", e))?;
            
        if output_elevated.status.success() {
            Ok(format!("Proses PID {} sedang dihentikan dengan hak akses Administrator.", pid))
        } else {
            Err(format!(
                "Gagal menghentikan proses. Silakan matikan PID {} secara manual via Task Manager.",
                pid
            ))
        }
    }

    #[cfg(target_os = "linux")]
    {
        // 1. Try normal kill
        let status = Command::new("kill")
            .args(&["-9", &pid.to_string()])
            .status();
            
        if let Ok(stat) = status {
            if stat.success() {
                return Ok(format!("Proses PID {} berhasil dihentikan.", pid));
            }
        }
        
        // 2. Elevate using pkexec (PolicyKit)
        let output = Command::new("pkexec")
            .args(&["kill", "-9", &pid.to_string()])
            .output()
            .map_err(|e| format!("Gagal memicu pkexec: {}", e))?;
            
        if output.status.success() {
            Ok(format!("Proses PID {} berhasil dihentikan menggunakan hak akses root (pkexec).", pid))
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            Err(format!(
                "Gagal menghentikan proses: {}. Silakan matikan PID {} secara manual.",
                stderr.trim(), pid
            ))
        }
    }

    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    {
        Err("Sistem operasi tidak didukung untuk penyelesaian otomatis.".to_string())
    }
}
