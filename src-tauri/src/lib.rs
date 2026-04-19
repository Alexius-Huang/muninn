mod curation;
mod keychain;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
      keychain::get_dropbox_token,
      keychain::set_dropbox_token,
      keychain::delete_dropbox_token,
      curation::read_curation,
      curation::write_curation,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
