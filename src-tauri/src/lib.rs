use std::process::Command;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

pub mod config;
pub mod commands;

pub fn create_hidden_command(program: &str) -> Command {
    let mut cmd = Command::new(program);
    #[cfg(target_os = "windows")]
    {
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    cmd
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
            commands::common::close_splashscreen
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
