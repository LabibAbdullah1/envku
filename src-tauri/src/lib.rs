use std::process::Command;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

pub mod config;
pub mod commands;
pub mod platform;


pub fn create_hidden_command(program: &str) -> Command {
    #[allow(unused_mut)]
    let mut cmd = Command::new(program);
    #[cfg(target_os = "windows")]
    {
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    cmd
}

pub fn execute_elevated_command(args: &[&str]) -> Result<std::process::Output, std::io::Error> {
    #[cfg(target_os = "windows")]
    {
        let mut cmd = Command::new(args[0]);
        cmd.args(&args[1..]);
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }
        cmd.output()
    }

    #[cfg(target_os = "linux")]
    {
        let is_wsl = std::env::var("WSL_DISTRO_NAME").is_ok() || 
                     std::fs::read_to_string("/proc/version").map(|v| v.to_lowercase().contains("microsoft")).unwrap_or(false);

        let program = if is_wsl {
            if std::path::Path::new("/usr/bin/sudo").exists() { "/usr/bin/sudo" } else { "sudo" }
        } else {
            if std::path::Path::new("/usr/bin/pkexec").exists() { "/usr/bin/pkexec" } else { "pkexec" }
        };
        let mut cmd = Command::new(program);
        cmd.args(args);
        let output = cmd.output();

        match output {
            Ok(ref out) if out.status.success() => Ok(output.unwrap()),
            _ => {
                let fallback = if program.contains("sudo") {
                    if std::path::Path::new("/usr/bin/pkexec").exists() { "/usr/bin/pkexec" } else { "pkexec" }
                } else {
                    if std::path::Path::new("/usr/bin/sudo").exists() { "/usr/bin/sudo" } else { "sudo" }
                };
                let mut fallback_cmd = Command::new(fallback);
                fallback_cmd.args(args);
                fallback_cmd.output()
            }
        }
    }

    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    {
        let mut cmd = Command::new(args[0]);
        cmd.args(&args[1..]);
        cmd.output()
    }
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            use tauri::Manager;
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .setup(|app| {
            use tauri::Manager;
            if let Some(webview_window) = app.get_webview_window("main") {
                let _ = webview_window.clear_all_browsing_data();
            }
            if let Some(splash_window) = app.get_webview_window("splashscreen") {
                let _ = splash_window.clear_all_browsing_data();
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet, 
            config::get_server_dir,
            commands::env::check_and_init_environment,
            commands::env::check_directories_exist,
            commands::env::open_terminal,
            commands::downloader::download_and_extract,
            commands::services::check_service_installed,
            commands::services::control_service,
            commands::services::install_service,
            commands::services::ping_port,
            commands::services::clear_redis_cache,
            commands::services::get_detailed_services_status,
            commands::projects::add_project,
            commands::projects::edit_project,
            commands::projects::delete_project,
            commands::projects::get_virtual_hosts,
            commands::php::switch_php_version,
            commands::php::get_active_php_version,
            commands::php::get_php_extensions,
            commands::php::toggle_php_extension,
            commands::node::get_nvm_versions,
            commands::node::switch_node_version,
            commands::node::install_node_version,
            commands::node::install_nvm,
            commands::common::select_directory,
            commands::common::open_in_browser,
            commands::common::close_splashscreen,
            commands::pre_flight::check_pre_flight,
            commands::pre_flight::resolve_port_conflict
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
