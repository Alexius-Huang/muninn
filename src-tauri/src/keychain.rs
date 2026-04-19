use std::process::Command;

const SERVICE: &str = "com.huang.muninn";
const ACCOUNT: &str = "dropbox_auth";
const LEGACY_ACCOUNT: &str = "dropbox_access_token";

#[tauri::command]
pub fn get_dropbox_auth() -> Result<Option<String>, String> {
    let out = Command::new("security")
        .args(["find-generic-password", "-s", SERVICE, "-a", ACCOUNT, "-w"])
        .output()
        .map_err(|e| e.to_string())?;
    if out.status.success() {
        let json = String::from_utf8_lossy(&out.stdout).trim().to_string();
        Ok(Some(json))
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub fn set_dropbox_auth(json: String) -> Result<(), String> {
    let _ = Command::new("security")
        .args(["delete-generic-password", "-s", SERVICE, "-a", ACCOUNT])
        .output();

    let out = Command::new("security")
        .args(["add-generic-password", "-s", SERVICE, "-a", ACCOUNT, "-w", &json])
        .output()
        .map_err(|e| e.to_string())?;

    if out.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
    }
}

#[tauri::command]
pub fn delete_dropbox_auth() -> Result<(), String> {
    let _ = Command::new("security")
        .args(["delete-generic-password", "-s", SERVICE, "-a", ACCOUNT])
        .output();
    Ok(())
}

#[tauri::command]
pub fn delete_legacy_dropbox_token() -> Result<(), String> {
    let _ = Command::new("security")
        .args(["delete-generic-password", "-s", SERVICE, "-a", LEGACY_ACCOUNT])
        .output();
    Ok(())
}
