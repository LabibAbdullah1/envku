use std::fs;
use crate::config::get_server_dir_path;

#[tauri::command]
pub fn check_service_installed(service: String) -> Result<bool, String> {
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

#[tauri::command]
pub fn control_service(service: String, action: String) -> Result<String, String> {
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
            // Wait 1.5s for MySQL database server to fully boot up and bind to port 3306
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
            // Wait 1s for Redis to start up, then flush cache automatically
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
