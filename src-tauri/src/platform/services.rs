#[cfg(target_os = "linux")]
use std::fs;
#[cfg(target_os = "linux")]
use std::path::Path;
#[cfg(target_os = "windows")]
use std::process::Command;
use crate::platform::env_path::get_server_dir_path;

/// Memeriksa apakah layanan terinstal di sistem.
pub fn check_service_installed(service: &str) -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        if service == "mailpit" {
            let server_dir = get_server_dir_path();
            let mailpit_exe = server_dir.join("mailpit").join("mailpit.exe");
            return Ok(mailpit_exe.exists());
        }

        let service_name = match service {
            "apache" => "Apache2.4",
            "mysql" => "mysql-server",
            "redis" => "redis-server",
            _ => service,
        };

        let output = crate::create_hidden_command("sc")
            .args(&["query", service_name])
            .output()
            .map_err(|e| format!("Gagal menjalankan query service: {}", e))?;
        
        let stdout = String::from_utf8_lossy(&output.stdout);
        if stdout.contains("1060") {
            Ok(false)
        } else {
            Ok(output.status.success() || stdout.contains("TYPE"))
        }
    }

    #[cfg(target_os = "linux")]
    {
        // Untuk Linux, kita periksa keberadaan file unit systemd kustom
        let service_file = format!("/etc/systemd/system/envku-{}.service", service);
        Ok(Path::new(&service_file).exists())
    }

    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    {
        let _ = service;
        Ok(false)
    }
}

/// Mengontrol status layanan (start / stop).
pub fn control_service(service: &str, action: &str) -> Result<String, String> {
    if action != "start" && action != "stop" {
        return Err("Aksi kontrol layanan tidak valid. Gunakan start atau stop.".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        if service == "mailpit" {
            if action == "start" {
                let server_dir = get_server_dir_path();
                let mailpit_exe = server_dir.join("mailpit").join("mailpit.exe");
                if !mailpit_exe.exists() {
                    return Err("Mailpit tidak terinstal.".to_string());
                }
                
                let mut cmd = Command::new(&mailpit_exe);
                // Windows-specific hidden process creation
                #[cfg(target_os = "windows")]
                {
                    use std::os::windows::process::CommandExt;
                    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
                }
                cmd.spawn().map_err(|e| format!("Gagal menjalankan Mailpit: {}", e))?;
                return Ok("Layanan Mailpit berhasil dijalankan".to_string());
            } else if action == "stop" {
                let _ = crate::create_hidden_command("taskkill")
                    .args(&["/F", "/IM", "mailpit.exe"])
                    .output();
                return Ok("Layanan Mailpit berhasil dihentikan".to_string());
            }
        }

        let service_name = match service {
            "apache" => "Apache2.4",
            "mysql" => "mysql-server",
            "redis" => "redis-server",
            _ => service,
        };

        let action_arg = match action {
            "start" => "start",
            "stop" => "stop",
            _ => action,
        };

        let output = crate::create_hidden_command("net")
            .args(&[action_arg, service_name])
            .output()
            .map_err(|e| format!("Gagal mengontrol service: {}", e))?;

        if output.status.success() {
            Ok(format!("Service {} berhasil di-{}", service_name, action))
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

    #[cfg(target_os = "linux")]
    {
        let systemd_service = format!("envku-{}", service);
        
        // Self-healing: if the service is being started and the unit file doesn't exist, register it first.
        if action == "start" {
            let service_file_path = format!("/etc/systemd/system/{}.service", systemd_service);
            if !std::path::Path::new(&service_file_path).exists() {
                install_service(service)?;
            }
        }
        
        // Jalankan perintah systemctl melalui pkexec untuk eskalasi hak akses jika diperlukan
        let output = crate::execute_elevated_command(&["systemctl", action, &systemd_service])
            .map_err(|e| format!("Gagal memanggil perintah elevated systemctl: {}", e))?;

        if output.status.success() {
            Ok(format!("Layanan {} berhasil di-{}", service, action))
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            Err(format!("Gagal mengontrol layanan systemd: {}", stderr.trim()))
        }
    }

    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    {
        let _ = (service, action);
        Err("Sistem operasi tidak didukung untuk kontrol layanan.".to_string())
    }
}

/// Menginstal file service sistem.
pub fn install_service(service: &str) -> Result<String, String> {
    let server_dir = get_server_dir_path();

    #[cfg(target_os = "windows")]
    {
        if service == "apache" {
            let apache_exe = server_dir.join("Apache24").join("bin").join("httpd.exe");
            
            // Hapus yang lama jika ada
            let _ = crate::create_hidden_command("sc").args(&["stop", "Apache2.4"]).output();
            let _ = crate::create_hidden_command("sc").args(&["delete", "Apache2.4"]).output();

            let mut cmd = Command::new(&apache_exe);
            #[cfg(target_os = "windows")]
            {
                use std::os::windows::process::CommandExt;
                cmd.creation_flags(0x08000000);
            }
            let output = cmd
                .args(&["-k", "install", "-n", "Apache2.4"])
                .output()
                .map_err(|e| format!("Gagal menginstal service Apache: {}", e))?;
            if output.status.success() {
                Ok("Service Apache2.4 berhasil diinstal".to_string())
            } else {
                Err(String::from_utf8_lossy(&output.stderr).to_string())
            }
        } else if service == "mysql" {
            let mysql_dir = server_dir.join("mysql");
            let mysqld_exe = mysql_dir.join("bin").join("mysqld.exe");
            let my_ini_path = mysql_dir.join("my.ini");
            let defaults_arg = format!("--defaults-file={}", my_ini_path.to_string_lossy());
            
            // Hapus yang lama jika ada
            let _ = crate::create_hidden_command("sc").args(&["stop", "mysql-server"]).output();
            let _ = crate::create_hidden_command("sc").args(&["delete", "mysql-server"]).output();

            let mut cmd = Command::new(&mysqld_exe);
            #[cfg(target_os = "windows")]
            {
                use std::os::windows::process::CommandExt;
                cmd.creation_flags(0x08000000);
            }
            let output = cmd
                .args(&["--install", "mysql-server", &defaults_arg])
                .output()
                .map_err(|e| format!("Gagal menginstal service MySQL: {}", e))?;
            if output.status.success() {
                Ok("Service mysql-server berhasil diinstal".to_string())
            } else {
                Err(String::from_utf8_lossy(&output.stderr).to_string())
            }
        } else if service == "redis" {
            let redis_dir = server_dir.join("redis");
            let redis_exe = redis_dir.join("redis-server.exe");
            let conf_path = redis_dir.join("redis.windows.conf");

            // Hapus yang lama jika ada
            let _ = crate::create_hidden_command("sc").args(&["stop", "redis-server"]).output();
            let _ = crate::create_hidden_command("sc").args(&["delete", "redis-server"]).output();

            let mut cmd = Command::new(&redis_exe);
            #[cfg(target_os = "windows")]
            {
                use std::os::windows::process::CommandExt;
                cmd.creation_flags(0x08000000);
            }
            let output = cmd
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
            Err(format!("Service {} tidak dikenal untuk diinstal di Windows.", service))
        }
    }

    #[cfg(target_os = "linux")]
    {
        // 1. Tentukan path file unit systemd kustom
        let service_file_path = format!("/etc/systemd/system/envku-{}.service", service);
        
        // Hapus & nonaktifkan yang lama jika ada
        let systemd_service = format!("envku-{}", service);
        
        // Hentikan & nonaktifkan layanan sistem standar yang berpotensi menyebabkan konflik port
        let system_service = match service {
            "apache" => "apache2",
            "mysql" => "mysql",
            "redis" => "redis-server",
            _ => "",
        };

        // 2. Buat isi berkas unit sesuai jenis layanan
        let service_content = match service {
            "apache" => {
                r#"[Unit]
Description=Envku Apache Web Server
After=network.target

[Service]
Type=simple
EnvironmentFile=/etc/apache2/envvars
ExecStart=/usr/sbin/apache2 -df /opt/server/config/apache2.conf
Restart=on-failure

[Install]
WantedBy=multi-user.target
"#.to_string()
            },
            "mysql" => {
                r#"[Unit]
Description=Envku MySQL Server
After=network.target

[Service]
Type=simple
User=mysql
ExecStart=/usr/sbin/mysqld --defaults-file=/opt/server/config/my.cnf
Restart=on-failure

[Install]
WantedBy=multi-user.target
"#.to_string()
            },
            "redis" => {
                r#"[Unit]
Description=Envku Redis Server
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/redis-server /opt/server/config/redis.conf
Restart=on-failure

[Install]
WantedBy=multi-user.target
"#.to_string()
            },
            "mailpit" => {
                let mailpit_bin = server_dir.join("mailpit").join("mailpit");
                let exec_line = format!("ExecStart={} --smtp-bind 0.0.0.0:8025 --ui-bind 0.0.0.0:8025", mailpit_bin.to_string_lossy());
                format!(r#"[Unit]
Description=Envku Mailpit Server
After=network.target

[Service]
Type=simple
{}
Restart=on-failure

[Install]
WantedBy=multi-user.target
"#, exec_line)
            },
            _ => return Err(format!("Layanan {} tidak dikenal untuk diinstal di Linux.", service)),
        };

        // 3. Tulis konten ke berkas sementara di folder temp
        let temp_dir = std::env::temp_dir();
        let temp_file = temp_dir.join(format!("envku-{}.service", service));
        fs::write(&temp_file, service_content)
            .map_err(|e| format!("Gagal membuat file unit kustom sementara: {}", e))?;

        // Construct single command string to execute under root privileges
        let mut cmd_str = format!(
            "systemctl stop {0} || true; systemctl disable {0} || true; rm -f {1}; ",
            systemd_service, service_file_path
        );

        if !system_service.is_empty() {
            cmd_str.push_str(&format!(
                "systemctl stop {0} || true; systemctl disable {0} || true; ",
                system_service
            ));
        }

        cmd_str.push_str(&format!(
            "cp {0} {1} && systemctl daemon-reload && systemctl enable {2}",
            temp_file.to_string_lossy(), service_file_path, systemd_service
        ));

        let output = crate::execute_elevated_command(&["sh", "-c", &cmd_str])
            .map_err(|e| format!("Gagal mendaftarkan systemd service elevated: {}", e))?;

        let _ = fs::remove_file(temp_file);

        if output.status.success() {
            Ok(format!("Layanan envku-{} berhasil didaftarkan di systemd", service))
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            Err(format!("Gagal mendaftarkan service: {}", stderr.trim()))
        }
    }

    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    {
        let _ = service;
        Err("Sistem operasi tidak didukung untuk instalasi layanan.".to_string())
    }
}
