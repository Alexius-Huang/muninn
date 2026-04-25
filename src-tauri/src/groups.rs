use std::fs;
use std::io::ErrorKind;
use tauri::AppHandle;
use tauri::Manager;

fn groups_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    Ok(base.join("groups.json"))
}

#[tauri::command]
pub async fn read_groups(app: AppHandle) -> Result<Option<String>, String> {
    let path = groups_path(&app)?;
    match fs::read_to_string(&path) {
        Ok(contents) => Ok(Some(contents)),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub async fn write_groups(app: AppHandle, contents: String) -> Result<(), String> {
    let path = groups_path(&app)?;
    let parent = path.parent().ok_or("no parent dir")?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, &contents).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
    Ok(())
}
