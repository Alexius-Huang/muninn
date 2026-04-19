use sha2::{Digest, Sha256};
use std::fs;
use std::io::ErrorKind;
use tauri::AppHandle;
use tauri::Manager;

fn folder_hash(folder_path: &str) -> String {
    let digest = Sha256::digest(folder_path.as_bytes());
    hex::encode(&digest[..8])
}

fn curation_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    Ok(base.join("curation"))
}

#[tauri::command]
pub async fn read_curation(
    app: AppHandle,
    folder_path: String,
) -> Result<Option<String>, String> {
    let dir = curation_dir(&app)?;
    let file = dir.join(format!("{}.json", folder_hash(&folder_path)));
    match fs::read_to_string(&file) {
        Ok(contents) => Ok(Some(contents)),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub async fn write_curation(
    app: AppHandle,
    folder_path: String,
    contents: String,
) -> Result<(), String> {
    let dir = curation_dir(&app)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let hash = folder_hash(&folder_path);
    let target = dir.join(format!("{}.json", hash));
    let tmp = dir.join(format!("{}.json.tmp", hash));
    fs::write(&tmp, &contents).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &target).map_err(|e| e.to_string())?;
    Ok(())
}
