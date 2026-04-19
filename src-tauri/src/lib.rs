mod curation;
mod keychain;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_deep_link::init())
    .plugin(tauri_plugin_opener::init())
    .invoke_handler(tauri::generate_handler![
      keychain::get_dropbox_auth,
      keychain::set_dropbox_auth,
      keychain::delete_dropbox_auth,
      keychain::delete_legacy_dropbox_token,
      curation::read_curation,
      curation::write_curation,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
