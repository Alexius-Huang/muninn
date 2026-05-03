mod cf_keychain;
mod curation;
mod groups;
mod keychain;
mod oauth_callback;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_deep_link::init())
    .plugin(tauri_plugin_opener::init())
    .invoke_handler(tauri::generate_handler![
      cf_keychain::read_cf_token,
      cf_keychain::save_cf_token,
      cf_keychain::delete_cf_token,
      keychain::get_dropbox_auth,
      keychain::set_dropbox_auth,
      keychain::delete_dropbox_auth,
      keychain::delete_legacy_dropbox_token,
      oauth_callback::wait_for_oauth_callback,
      curation::read_curation,
      curation::write_curation,
      curation::list_curation,
      groups::read_groups,
      groups::write_groups,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
