use std::process::Command;

const SERVICE: &str = "com.huang.muninn";
const ACCOUNT: &str = "dropbox_access_token";

#[tauri::command]
pub fn get_dropbox_token() -> Result<Option<String>, String> {
    let out = Command::new("security")
        .args(["find-generic-password", "-s", SERVICE, "-a", ACCOUNT, "-w"])
        .output()
        .map_err(|e| e.to_string())?;
    if out.status.success() {
        let token = String::from_utf8_lossy(&out.stdout).trim().to_string();
        Ok(Some(token))
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub fn set_dropbox_token(token: String) -> Result<(), String> {
    // Delete any existing entry first (add fails if one exists).
    let _ = Command::new("security")
        .args(["delete-generic-password", "-s", SERVICE, "-a", ACCOUNT])
        .output();

    let out = Command::new("security")
        .args(["add-generic-password", "-s", SERVICE, "-a", ACCOUNT, "-w", &token])
        .output()
        .map_err(|e| e.to_string())?;

    if out.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
    }
}

#[tauri::command]
pub fn delete_dropbox_token() -> Result<(), String> {
    let _ = Command::new("security")
        .args(["delete-generic-password", "-s", SERVICE, "-a", ACCOUNT])
        .output();
    Ok(())
}
