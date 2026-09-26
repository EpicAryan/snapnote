mod commands;
mod error;
mod state;
mod watch_folder;

use snapnote_core::store::Store;
use state::AppState;
use std::sync::Mutex;
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data_dir = app.path().local_data_dir()?.join("snapnote");
            std::fs::create_dir_all(&data_dir)?;
            let store = Store::open(&data_dir.join("snapnote.db"), &watch_folder::detected_default().to_string_lossy())?;
            let settings = store.get_settings()?;
            let folder = watch_folder::resolve_from_settings(&settings);
            store.set_default_destination_path(&folder.to_string_lossy())?;
            app.manage(AppState {
                store: Mutex::new(store),
                thumbs_dir: data_dir.join("thumbs"),
                data_dir,
                watch_folder: Mutex::new(folder),
                toast_id: Mutex::new(None),
                watcher: Mutex::new(None),
                hotkey_error: Mutex::new(None),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::screenshots::list_screenshots,
            commands::screenshots::get_screenshot,
            commands::destinations::list_destinations,
            commands::destinations::create_destination,
            commands::destinations::update_destination,
            commands::destinations::delete_destination,
            commands::destinations::reorder_destinations,
            commands::settings::get_settings,
            commands::settings::set_setting,
            commands::system::detect_watch_folder,
            commands::system::folder_exists,
            commands::system::create_folder,
            commands::system::open_data_folder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running snapnote");
}
