#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Mutex;
use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Manager, Runtime, State};
use tauri_plugin_dialog::DialogExt;

/// File passed on app launch (e.g. double-clicked `.excalidraw` file).
/// Taken (cleared) once by the frontend after mount.
#[tauri::command]
fn get_launch_file(state: State<'_, Mutex<Option<String>>>) -> Option<String> {
    state.lock().unwrap().take()
}

fn is_scene_file(arg: &str) -> bool {
    arg.to_lowercase().ends_with(".excalidraw")
}

/// Paint-style native menu bar. Items forward to the frontend via the
/// `menu-event` event; `file-exit` and `help-about` are handled here.
/// NOTE: no accelerators are bound on purpose — keyboard shortcuts are
/// handled page-side (DesktopBridge) to avoid double-execution. The
/// `\tCtrl+S` suffixes are display-only hints.
fn build_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<tauri::menu::Menu<R>> {
    let file = SubmenuBuilder::new(app, "File")
        .items(&[
            &MenuItemBuilder::with_id("file-new", "New").build(app)?,
            &MenuItemBuilder::with_id("file-open", "Open…\tCtrl+O").build(app)?,
            &MenuItemBuilder::with_id("file-save", "Save\tCtrl+S").build(app)?,
            &MenuItemBuilder::with_id("file-save-as", "Save As…").build(app)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItemBuilder::with_id("file-export", "Export…\tCtrl+Shift+E").build(app)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItemBuilder::with_id("file-exit", "Exit").build(app)?,
        ])
        .build()?;

    let edit = SubmenuBuilder::new(app, "Edit")
        .items(&[
            &MenuItemBuilder::with_id("edit-undo", "Undo\tCtrl+Z").build(app)?,
            &MenuItemBuilder::with_id("edit-redo", "Redo\tCtrl+Shift+Z").build(app)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItemBuilder::with_id("edit-clear", "Clear Canvas…").build(app)?,
        ])
        .build()?;

    let view = SubmenuBuilder::new(app, "View")
        .items(&[
            &MenuItemBuilder::with_id("view-library", "Library").build(app)?,
            &MenuItemBuilder::with_id("view-search", "Find on Canvas…\tCtrl+F").build(app)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItemBuilder::with_id("view-zoom-in", "Zoom In\tCtrl++").build(app)?,
            &MenuItemBuilder::with_id("view-zoom-out", "Zoom Out\tCtrl+-").build(app)?,
            &MenuItemBuilder::with_id("view-zoom-reset", "Reset Zoom\tCtrl+0").build(app)?,
            &MenuItemBuilder::with_id("view-zoom-fit", "Zoom to Fit\tShift+1").build(app)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItemBuilder::with_id("view-theme", "Toggle Dark / Light Theme").build(app)?,
        ])
        .build()?;

    let help = SubmenuBuilder::new(app, "Help")
        .items(&[
            &MenuItemBuilder::with_id("help-shortcuts", "Keyboard Shortcuts…").build(app)?,
            &MenuItemBuilder::with_id("help-about", "About Excalidraw Desktop").build(app)?,
        ])
        .build()?;

    MenuBuilder::new(app).items(&[&file, &edit, &view, &help]).build()
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
            let handle = app.handle().clone();
            app.set_menu(build_menu(&handle)?)?;
            let args: Vec<String> = std::env::args().collect();
            if let Some(path) = args.into_iter().skip(1).find(|a| is_scene_file(&a)) {
                if let Some(state) = app.try_state::<Mutex<Option<String>>>() {
                    *state.lock().unwrap() = Some(path);
                }
            }
            Ok(())
        })
        .on_menu_event(|app: &AppHandle, event| {
            let id = event.id().as_ref();
            match id {
                "file-exit" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.close();
                    }
                }
                "help-about" => {
                    app.dialog()
                        .message(format!(
                            "Excalidraw Desktop {}\nBuild: {}\n\nLightweight offline whiteboard for Windows.\nDrawings auto-save locally; use File → Save for .excalidraw files.",
                            env!("CARGO_PKG_VERSION"),
                            env!("BUILD_FINGERPRINT"),
                        ))
                        .title("About Excalidraw Desktop")
                        .show(|_| {});
                }
                _ => {
                    let _ = app.emit("menu-event", id);
                }
            }
        })
        .invoke_handler(tauri::generate_handler![get_launch_file])
        .run(tauri::generate_context!())
        .expect("error while running Excalidraw Desktop");
}
