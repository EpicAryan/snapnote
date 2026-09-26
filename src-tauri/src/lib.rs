mod autostart;
mod clipboard;
mod commands;
mod error;
mod hotkey;
mod reconcile;
mod startup;
mod state;
mod tray;
mod undo;
mod watch;
mod watch_folder;
mod win32;
mod windows;

use snapnote_core::store::Store;
use state::AppState;
use std::sync::Mutex;
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            windows::show_library(app);
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
        .plugin(tauri_plugin_clipboard_manager::init())
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::CloseRequested { api, .. } => {
                // Closing any window hides it; the app lives in the tray. Quit is in the tray menu.
                api.prevent_close();
                if window.label() == windows::LIBRARY {
                    windows::save_library_bounds(window.app_handle());
                }
                let _ = window.hide();
            }
            // Coming back to the library (typically from Explorer) re-checks files on disk.
            tauri::WindowEvent::Focused(true) if window.label() == windows::LIBRARY => {
                reconcile::spawn(window.app_handle());
            }
            // The normal geometry is only readable while not maximized, so it is noted as it changes.
            tauri::WindowEvent::Resized(_) | tauri::WindowEvent::Moved(_) if window.label() == windows::LIBRARY => {
                windows::note_library_bounds(window);
            }
            _ => {}
        })
        .setup(|app| {
            let data_dir = app.path().local_data_dir()?.join("snapnote");
            std::fs::create_dir_all(&data_dir)?;
            let db_path = data_dir.join("snapnote.db");
            // A database we cannot open is fatal and must be explained, never silently recreated.
            let store = match Store::open(&db_path, &watch_folder::detected_default().to_string_lossy()) {
                Ok(s) => s,
                Err(e) => {
                    use tauri_plugin_dialog::{DialogExt, MessageDialogKind};
                    app.dialog()
                        .message(format!(
                            "snapnote cannot open its database at {}:\n{e}\n\nThe file has been left untouched. Fix or move it, then start snapnote again.",
                            db_path.display()
                        ))
                        .title("snapnote cannot start")
                        .kind(MessageDialogKind::Error)
                        .blocking_show();
                    return Err(Box::new(e));
                }
            };
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
                library_placement: Mutex::new(Default::default()),
                undo: Mutex::new(None),
            });

            windows::restore_library_bounds(app.handle());
            tray::build(app.handle())?;
            let _ = hotkey::register_label_hotkey(app.handle(), &settings.label_hotkey);
            autostart::apply(app.handle(), settings.autostart);
            watch::start(app.handle())?;

            // Flag rows whose files vanished while we were not running (off the main thread).
            reconcile::spawn(app.handle());

            if startup::should_show_library(settings.first_run_done, cfg!(debug_assertions)) {
                windows::show_library(app.handle());
            }
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
            commands::windows::label_last_screenshot,
            commands::screenshots::save_metadata,
            commands::screenshots::retry_move,
            commands::screenshots::get_thumbnail,
            commands::screenshots::get_image_data_url,
            commands::screenshots::open_file,
            commands::screenshots::reveal_file,
            commands::screenshots::remove_from_library,
            commands::screenshots::delete_screenshots,
            commands::screenshots::undo_delete,
            commands::screenshots::copy_screenshots,
            commands::screenshots::move_screenshots,
            commands::screenshots::add_tags,
            commands::system::import_existing,
            commands::system::clear_thumbnail_cache,
            commands::system::paste_clipboard,
            commands::system::add_files,
            commands::system::reconcile_now,
            commands::system::recent_labels,
            commands::system::library_counts,
        ])
        .build(tauri::generate_context!())
        .expect("error while building snapnote")
        .run(|_app, event| {
            // All windows are hidden rather than destroyed, so this only fires on an explicit
            // exit; the guard keeps the tray alive if a future change destroys a window.
            if let tauri::RunEvent::ExitRequested { api, code, .. } = event {
                if code.is_none() {
                    api.prevent_exit();
                }
            }
        });
}
