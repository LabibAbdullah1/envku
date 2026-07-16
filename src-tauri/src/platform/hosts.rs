use std::fs;
#[cfg(target_os = "linux")]
use std::process::Command;

#[cfg(target_os = "windows")]
const HOSTS_PATH: &str = "C:\\Windows\\System32\\drivers\\etc\\hosts";

#[cfg(target_os = "linux")]
const HOSTS_PATH: &str = "/etc/hosts";

#[cfg(not(any(target_os = "windows", target_os = "linux")))]
const HOSTS_PATH: &str = "/etc/hosts";

/// Membaca konten file hosts secara aman.
pub fn read_hosts() -> Result<String, String> {
    fs::read_to_string(HOSTS_PATH)
        .map_err(|e| format!("Gagal membaca file hosts: {}", e))
}

/// Menambahkan entri domain baru ke file hosts.
pub fn add_host_entry(domain: &str, ip: &str) -> Result<(), String> {
    let hosts_content = read_hosts()?;
    
    let host_entry = format!("{} {}", ip, domain);
    let domain_exists = hosts_content.lines().any(|line| {
        let clean = line.trim();
        !clean.starts_with('#') && clean.contains(domain)
    });

    if domain_exists {
        return Ok(());
    }

    let mut new_content = hosts_content.clone();
    if !new_content.ends_with('\n') && !new_content.is_empty() {
        new_content.push('\n');
    }
    new_content.push_str(&format!("{}\n", host_entry));

    write_hosts(&new_content)
}

/// Menghapus entri domain dari file hosts.
pub fn remove_host_entry(domain: &str) -> Result<(), String> {
    let hosts_content = read_hosts()?;
    
    let new_lines: Vec<String> = hosts_content
        .lines()
        .filter(|line| {
            let clean = line.trim();
            clean.starts_with('#') || !clean.contains(domain)
        })
        .map(|s| s.to_string())
        .collect();
        
    let mut new_content = new_lines.join("\n");
    if !new_content.ends_with('\n') && !new_content.is_empty() {
        new_content.push('\n');
    }

    write_hosts(&new_content)
}

/// Menulis konten baru ke file hosts dengan penanganan hak akses tinggi jika diperlukan.
fn write_hosts(content: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        // Di Windows, jika dijalankan sebagai non-admin, penulisan langsung ke hosts_path akan error.
        // Kita berasumsi aplikasi dijalankan sebagai Administrator di Windows (sesuai requireAdministrator).
        fs::write(HOSTS_PATH, content)
            .map_err(|e| format!("Gagal menulis file hosts (Pastikan dijalankan sebagai Administrator): {}", e))
    }

    #[cfg(target_os = "linux")]
    {
        // Di Linux, kita menulis ke file sementara terlebih dahulu, lalu menyalinnya menggunakan `pkexec cp`
        let temp_dir = std::env::temp_dir();
        let temp_hosts = temp_dir.join("envku_hosts_temp");
        
        fs::write(&temp_hosts, content)
            .map_err(|e| format!("Gagal menulis file hosts sementara: {}", e))?;
            
        // Salin menggunakan pkexec
        let output = Command::new("pkexec")
            .args(&["cp", &temp_hosts.to_string_lossy(), HOSTS_PATH])
            .output()
            .map_err(|e| format!("Gagal menjalankan pkexec cp: {}", e))?;
            
        // Bersihkan file sementara
        let _ = fs::remove_file(temp_hosts);
        
        if output.status.success() {
            Ok(())
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            Err(format!("Gagal menulis /etc/hosts via pkexec: {}", stderr.trim()))
        }
    }

    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    {
        fs::write(HOSTS_PATH, content)
            .map_err(|e| format!("Gagal menulis file hosts: {}", e))
    }
}
