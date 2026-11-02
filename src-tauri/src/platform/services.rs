#[cfg(target_os = "linux")]
use std::fs;
#[cfg(target_os = "linux")]
use std::path::Path;
#[cfg(target_os = "windows")]
use std::process::Command;
use crate::platform::env_path::get_server_dir_path;

fn normalize_service_id(service: &str) -> &str {
    match service {
        "Apache2.4" | "Apache24" | "apache24" | "Apache" | "apache" => "apache",
        "mysql-server" | "MySQL" | "mysql" => "mysql",
        "redis-server" | "Redis" | "redis" => "redis",
        "mailpit" | "Mailpit" => "mailpit",
        _ => service,
    }
}

/// Memeriksa apakah layanan terinstal di sistem.
pub fn check_service_installed(service: &str) -> Result<bool, String> {
    let norm = normalize_service_id(service);

    #[cfg(target_os = "windows")]
    {
        if norm == "mailpit" {
            let server_dir = get_server_dir_path();
            let mailpit_exe = server_dir.join("mailpit").join("mailpit.exe");
            return Ok(mailpit_exe.exists());
        }

        let service_name = match norm {
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
        let service_file = format!("/etc/systemd/system/envku-{}.service", norm);
        Ok(Path::new(&service_file).exists())
    }

    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    {
        let _ = norm;
        Ok(false)
    }
}

/// Mengontrol status layanan (start / stop / restart).
pub fn control_service(service: &str, action: &str) -> Result<String, String> {
    if action != "start" && action != "stop" && action != "restart" {
        return Err("Aksi kontrol layanan tidak valid. Gunakan start, stop, atau restart.".to_string());
    }

    let norm = normalize_service_id(service);

    #[cfg(target_os = "windows")]
    {
        if action == "restart" {
            let _ = control_service(service, "stop");
            return control_service(service, "start");
        }

        if norm == "mailpit" {
            if action == "start" {
                let server_dir = get_server_dir_path();
                let mailpit_exe = server_dir.join("mailpit").join("mailpit.exe");
                if !mailpit_exe.exists() {
                    return Err("Mailpit tidak terinstal.".to_string());
                }
                
                let mut cmd = Command::new(&mailpit_exe);
                use std::os::windows::process::CommandExt;
                cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
                cmd.spawn().map_err(|e| format!("Gagal menjalankan Mailpit: {}", e))?;
                return Ok("Layanan Mailpit berhasil dijalankan".to_string());
            } else if action == "stop" {
                let _ = crate::create_hidden_command("taskkill")
                    .args(&["/F", "/IM", "mailpit.exe"])
                    .output();
                return Ok("Layanan Mailpit berhasil dihentikan".to_string());
            }
        }

        let service_name = match norm {
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
        // Cegah eksekusi dan pemicuan pop-up password jika komponen belum diunduh/dipasang
        if action == "start" || action == "restart" {
            let server_dir = get_server_dir_path();
            let is_installed = match norm {
                "apache" => server_dir.join("Apache24").exists() && server_dir.join("config").join("apache2.conf").exists(),
                "mysql" => server_dir.join("mysql").exists() && server_dir.join("config").join("my.cnf").exists(),
                "redis" => server_dir.join("redis").exists() && server_dir.join("config").join("redis.conf").exists(),
                "mailpit" => server_dir.join("mailpit").join("mailpit").exists(),
                _ => true,
            };

            if !is_installed {
                return Err(format!(
                    "Layanan {} tidak dapat dijalankan karena file komponen/konfigurasi belum diunduh. Silakan unduh terlebih dahulu di menu Downloader.",
                    norm.to_uppercase()
                ));
            }
        }

        let systemd_service = format!("envku-{}", norm);
        
        // Self-healing: if the service is being started or restarted and the unit file doesn't exist, register it first.
        if action == "start" || action == "restart" {
            let service_file_path = format!("/etc/systemd/system/{}.service", systemd_service);
            if !std::path::Path::new(&service_file_path).exists() {
                install_service(norm)?;
            }
        }

        // Salin my.cnf ke /etc/mysql/envku-my.cnf agar tidak diblokir oleh AppArmor Linux saat start/restart
        if (action == "start" || action == "restart") && norm == "mysql" {
            let _ = crate::execute_elevated_command(&["sh", "-c", "mkdir -p /etc/mysql && cp -f /opt/server/config/my.cnf /etc/mysql/envku-my.cnf && chown mysql:mysql /etc/mysql/envku-my.cnf"]);
        }
        
        // Jalankan perintah systemctl melalui pkexec untuk eskalasi hak akses jika diperlukan
        let output = crate::execute_elevated_command(&["systemctl", action, &systemd_service])
            .map_err(|e| format!("Gagal memanggil perintah elevated systemctl: {}", e))?;

        if output.status.success() {
            Ok(format!("Layanan {} berhasil di-{}", norm, action))
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            Err(format!("Gagal mengontrol layanan systemd: {}", stderr.trim()))
        }
    }

    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    {
        let _ = (norm, action);
        Err("Sistem operasi tidak didukung untuk kontrol layanan.".to_string())
    }
}

/// Menginstal file service sistem.
pub fn install_service(service: &str) -> Result<String, String> {
    let server_dir = get_server_dir_path();
    let norm = normalize_service_id(service);

    #[cfg(target_os = "windows")]
    {
        if norm == "apache" {
            let apache_dir = server_dir.join("Apache24");
            let apache_exe = apache_dir.join("bin").join("httpd.exe");
            if !apache_exe.exists() {
                return Err(format!(
                    "File biner Apache (httpd.exe) tidak ditemukan di {}. Pastikan Apache sudah diekstrak dengan benar melalui menu Downloader.",
                    apache_exe.to_string_lossy()
                ));
            }

            // Pengecekan prasyarat Visual C++ Redistributable (VCRUNTIME140.dll)
            let sys32_vc = std::path::Path::new("C:\\Windows\\System32\\vcruntime140.dll");
            if !sys32_vc.exists() {
                return Err(
                    "Komponen Visual C++ Redistributable 2015-2022 (x64) belum terpasang di komputer Anda. Silakan unduh dan pasang 'vc_redist.x64.exe' dari Microsoft terlebih dahulu agar Apache dapat berjalan.".to_string()
                );
            }

            // Hentikan proses httpd lama yang mungkin masih mengunci port atau berkas
            let _ = crate::create_hidden_command("taskkill").args(&["/F", "/IM", "httpd.exe"]).output();
            let _ = crate::create_hidden_command("sc").args(&["stop", "Apache2.4"]).output();
            let _ = crate::create_hidden_command("sc").args(&["delete", "Apache2.4"]).output();
            std::thread::sleep(std::time::Duration::from_millis(600));

            // Pastikan berkas modular conf/extra/httpd-php.conf tersedia agar tidak error saat validasi sintaks
            let extra_dir = apache_dir.join("conf").join("extra");
            let _ = std::fs::create_dir_all(&extra_dir);
            let php_conf_file = extra_dir.join("httpd-php.conf");
            if !php_conf_file.exists() {
                let _ = std::fs::write(&php_conf_file, "# Envku Modular PHP Configuration\n# Diperbarui secara otomatis saat memilih versi PHP di PHP Switcher\n");
            }

            let httpd_conf_path = apache_dir.join("conf").join("httpd.conf");

            let mut cmd = Command::new(&apache_exe);
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000);
            let output = cmd
                .args(&[
                    "-k", "install",
                    "-n", "Apache2.4",
                    "-f", &httpd_conf_path.to_string_lossy(),
                    "-d", &apache_dir.to_string_lossy(),
                ])
                .output()
                .map_err(|e| format!("Gagal menginstal service Apache: {}", e))?;

            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            let combined = format!("{} {}", stdout, stderr);

            let is_success = output.status.success() 
                || combined.contains("successfully installed") 
                || combined.contains("Service is already installed")
                || combined.contains("already exists");

            if is_success {
                // Atur tipe startup ke Manual (demand) agar tidak berjalan otomatis saat Windows dinyalakan
                let _ = crate::create_hidden_command("sc").args(&["config", "Apache2.4", "start=", "demand"]).output();
                Ok("Service Apache2.4 berhasil diinstal (Startup Mode: Manual)".to_string())
            } else {
                Err(format!(
                    "Gagal menginstal service Apache: {}. Pastikan port 80 tidak terblokir dan jalankan Envku sebagai Administrator.",
                    stderr.trim()
                ))
            }
        } else if norm == "mysql" {
            let mysql_dir = server_dir.join("mysql");
            let mysqld_exe = mysql_dir.join("bin").join("mysqld.exe");
            let my_ini_path = mysql_dir.join("my.ini");
            let defaults_arg = format!("--defaults-file={}", my_ini_path.to_string_lossy());
            
            // Hapus yang lama jika ada
            let _ = crate::create_hidden_command("taskkill").args(&["/F", "/IM", "mysqld.exe"]).output();
            let _ = crate::create_hidden_command("sc").args(&["stop", "mysql-server"]).output();
            let _ = crate::create_hidden_command("sc").args(&["delete", "mysql-server"]).output();
            std::thread::sleep(std::time::Duration::from_millis(500));

            let mut cmd = Command::new(&mysqld_exe);
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000);
            let output = cmd
                .args(&["--install", "mysql-server", &defaults_arg])
                .output()
                .map_err(|e| format!("Gagal menginstal service MySQL: {}", e))?;

            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            let combined = format!("{} {}", stdout, stderr);

            let is_success = output.status.success()
                || combined.contains("successfully installed")
                || combined.contains("Service already exists")
                || combined.contains("already installed");

            if is_success {
                let _ = crate::create_hidden_command("sc").args(&["config", "mysql-server", "start=", "demand"]).output();
                Ok("Service mysql-server berhasil diinstal (Startup Mode: Manual)".to_string())
            } else {
                Err(format!("Gagal menginstal service MySQL: {}", stderr.trim()))
            }
        } else if norm == "redis" {
            let redis_dir = server_dir.join("redis");
            let redis_exe = redis_dir.join("redis-server.exe");
            let conf_path = redis_dir.join("redis.windows.conf");

            // Hapus yang lama jika ada
            let _ = crate::create_hidden_command("taskkill").args(&["/F", "/IM", "redis-server.exe"]).output();
            let _ = crate::create_hidden_command("sc").args(&["stop", "redis-server"]).output();
            let _ = crate::create_hidden_command("sc").args(&["delete", "redis-server"]).output();
            std::thread::sleep(std::time::Duration::from_millis(500));

            let mut cmd = Command::new(&redis_exe);
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000);
            let output = cmd
                .args(&[
                    "--service-install",
                    &conf_path.to_string_lossy(),
                    "--service-name",
                    "redis-server"
                ])
                .output()
                .map_err(|e| format!("Gagal menginstal service Redis: {}", e))?;

            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            let combined = format!("{} {}", stdout, stderr);

            let is_success = output.status.success()
                || combined.contains("successfully installed")
                || combined.contains("service already exists");

            if is_success {
                let _ = crate::create_hidden_command("sc").args(&["config", "redis-server", "start=", "demand"]).output();
                Ok("Service redis-server berhasil diinstal (Startup Mode: Manual)".to_string())
            } else {
                Err(format!("Gagal menginstal service Redis: {}", stderr.trim()))
            }
        } else if norm == "mailpit" {
            Ok("Mailpit adalah aplikasi mandiri (tidak didaftarkan sebagai service Windows SCM).".to_string())
        } else {
            Err(format!("Service {} tidak dikenal untuk diinstal di Windows.", service))
        }
    }

    #[cfg(target_os = "linux")]
    {
        // Cegah registrasi service jika biner/direktori belum diunduh
        let is_downloaded = match norm {
            "apache" => server_dir.join("Apache24").exists(),
            "mysql" => server_dir.join("mysql").exists(),
            "redis" => server_dir.join("redis").exists(),
            "mailpit" => server_dir.join("mailpit").join("mailpit").exists(),
            _ => true,
        };

        if !is_downloaded {
            return Err(format!(
                "Tidak dapat mendaftarkan layanan: folder komponen {} belum diunduh. Silakan pasang terlebih dahulu.",
                norm.to_uppercase()
            ));
        }

        // 1. Tentukan path file unit systemd kustom
        let service_file_path = format!("/etc/systemd/system/envku-{}.service", norm);
        let systemd_service = format!("envku-{}", norm);
        
        let system_service = match norm {
            "apache" => "apache2",
            "mysql" => "mysql",
            "redis" => "redis-server",
            _ => "",
        };

        // 2. Buat isi berkas unit sesuai jenis layanan
        let service_content = match norm {
            "apache" => {
                r#"[Unit]
Description=Envku Apache Web Server
After=network.target

[Service]
Type=simple
RuntimeDirectory=apache2
RuntimeDirectoryMode=0755
Environment=APACHE_RUN_DIR=/var/run/apache2
Environment=APACHE_RUN_USER=www-data
Environment=APACHE_RUN_GROUP=www-data
Environment=APACHE_PID_FILE=/var/run/apache2/apache2.pid
Environment=APACHE_LOG_DIR=/var/log/apache2
Environment=APACHE_LOCK_DIR=/var/lock/apache2
ExecStart=/usr/sbin/apache2 -f /opt/server/config/apache2.conf -DFOREGROUND
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
RuntimeDirectory=mysqld
RuntimeDirectoryMode=0755
ExecStart=/usr/sbin/mysqld --defaults-file=/etc/mysql/envku-my.cnf
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
RuntimeDirectory=redis
RuntimeDirectoryMode=0755
ExecStart=/usr/bin/redis-server /opt/server/config/redis.conf
Restart=on-failure

[Install]
WantedBy=multi-user.target
"#.to_string()
            },
            "mailpit" => {
                let mailpit_bin = server_dir.join("mailpit").join("mailpit");
                let exec_line = format!("ExecStart={} --smtp 0.0.0.0:1025 --listen 0.0.0.0:8025", mailpit_bin.to_string_lossy());
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
            _ => return Err(format!("Layanan {} tidak dikenal untuk diinstal di Linux.", norm)),
        };

        let temp_dir = std::env::temp_dir();
        let temp_file = temp_dir.join(format!("envku-{}.service", norm));
        fs::write(&temp_file, service_content)
            .map_err(|e| format!("Gagal membuat file unit kustom sementara: {}", e))?;

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

        if norm == "mysql" {
            cmd_str.push_str("mkdir -p /etc/mysql && cp -f /opt/server/config/my.cnf /etc/mysql/envku-my.cnf && chown mysql:mysql /etc/mysql/envku-my.cnf && ");
        }

        cmd_str.push_str(&format!(
            "cp {0} {1} && systemctl daemon-reload && systemctl disable {2}",
            temp_file.to_string_lossy(), service_file_path, systemd_service
        ));

        let output = crate::execute_elevated_command(&["sh", "-c", &cmd_str])
            .map_err(|e| format!("Gagal mendaftarkan systemd service elevated: {}", e))?;

        let _ = fs::remove_file(temp_file);

        if output.status.success() {
            Ok(format!("Layanan envku-{} berhasil didaftarkan di systemd", norm))
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            Err(format!("Gagal mendaftarkan service: {}", stderr.trim()))
        }
    }

    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    {
        let _ = norm;
        Err("Sistem operasi tidak didukung untuk instalasi layanan.".to_string())
    }
}
