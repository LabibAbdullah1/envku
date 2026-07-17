#[cfg(target_os = "linux")]
use std::process::Command;

/// Mendaftarkan port di firewall sistem (Windows Firewall / Linux UFW).
pub fn register_firewall_port(port: u16) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        // Jalankan perintah netsh untuk menambahkan aturan firewall masuk
        let output = crate::create_hidden_command("netsh")
            .args(&[
                "advfirewall", "firewall", "add", "rule",
                &format!("name=Envku_Port_{}", port),
                "dir=in", "action=allow", "protocol=TCP",
                &format!("localport={}", port)
            ])
            .output();
            
        if let Ok(out) = output {
            if out.status.success() {
                return Ok(());
            }
            let stderr = String::from_utf8_lossy(&out.stderr);
            return Err(format!("Gagal mendaftarkan port Windows Firewall: {}", stderr.trim()));
        }
        Ok(())
    }

    #[cfg(target_os = "linux")]
    {
        // Periksa apakah UFW (Uncomplicated Firewall) terinstal dan aktif
        let ufw_status = Command::new("ufw").arg("status").output();
        if let Ok(out) = ufw_status {
            let status_str = String::from_utf8_lossy(&out.stdout);
            if status_str.contains("active") {
                // Panggil pkexec untuk mengeksekusi ufw allow <port>
                let output = Command::new("pkexec")
                    .args(&["ufw", "allow", &port.to_string()])
                    .output()
                    .map_err(|e| format!("Gagal memanggil pkexec ufw: {}", e))?;
                    
                if !output.status.success() {
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    return Err(format!("Gagal membuka port {} di UFW: {}", port, stderr.trim()));
                }
            }
        }
        Ok(())
    }

    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    {
        let _ = port;
        Ok(())
    }
}

/// Menghapus pendaftaran port di firewall sistem.
pub fn unregister_firewall_port(port: u16) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let _ = crate::create_hidden_command("netsh")
            .args(&[
                "advfirewall", "firewall", "delete", "rule",
                &format!("name=Envku_Port_{}", port)
            ])
            .output();
        Ok(())
    }

    #[cfg(target_os = "linux")]
    {
        let ufw_status = Command::new("ufw").arg("status").output();
        if let Ok(out) = ufw_status {
            let status_str = String::from_utf8_lossy(&out.stdout);
            if status_str.contains("active") {
                let _ = Command::new("pkexec")
                    .args(&["ufw", "delete", "allow", &port.to_string()])
                    .output();
            }
        }
        Ok(())
    }

    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    {
        let _ = port;
        Ok(())
    }
}
