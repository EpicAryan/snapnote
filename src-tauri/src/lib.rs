mod commands;
mod error;
mod state;
mod watch_folder;
mod windows;

use snapnote_core::store::Store;
use state::AppState;
use std::sync::Mutex;
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // Closing any window hides it; the app lives in the tray. Quit is in the tray menu.
                api.prevent_close();
                if window.label() == windows::LIBRARY {
                    windows::save_library_bounds(window.app_handle());
                }
                let _ = window.hide();
            }
        })
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
            windows::restore_library_bounds(app.handle());
            // In `tauri dev` there is no tray yet (Task 18) and all windows start hidden,
            // so show the library so there is something to look at.
            #[cfg(debug_assertions)]
            windows::show_library(app.handle());
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
            commands::windows::hide_toast,
            commands::windows::open_popup_for,
            commands::windows::hide_popup,
        ])
        .run(tauri::generate_context!())
        .expect("error while running snapnote");
}
