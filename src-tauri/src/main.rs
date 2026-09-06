#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Mutex;
use tauri::{Emitter, Manager, State};

/// File passed on app launch (e.g. double-clicked `.excalidraw` file).
/// Taken (cleared) once by the frontend after mount.
#[tauri::command]
fn get_launch_file(state: State<'_, Mutex<Option<String>>>) -> Option<String> {
    state.lock().unwrap().take()
}

fn is_scene_file(arg: &str) -> bool {
    arg.to_lowercase().ends_with(".excalidraw")
}

fn main() {
    tauri::Builder::default()
        .manage(Mutex::new(None::<String>))
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // App already running (e.g. another `.excalidraw` double-click):
            // forward the file to the running instance.
            if let Some(path) = args.iter().skip(1).find(|a| is_scene_file(a)) {
                let _ = app.emit("open-file", path.clone());
            }
        }))
        .setup(|app| {
            let args: Vec<String> = std::env::args().collect();
            if let Some(path) = args.into_iter().skip(1).find(|a| is_scene_file(&a)) {
                if let Some(state) = app.try_state::<Mutex<Option<String>>>() {
                    *state.lock().unwrap() = Some(path);
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_launch_file])
        .run(tauri::generate_context!())
        .expect("error while running Excalidraw Desktop");
}
