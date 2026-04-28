#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|_app| {
            #[cfg(debug_assertions)]
            {
                // Devtools auto-open in dev builds
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Apple Store POS");
}