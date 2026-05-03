use std::process::Command;

const SERVICE: &str = "com.huang.muninn";
const CF_ACCOUNT: &str = "cf_auth";

#[tauri::command]
pub fn read_cf_token() -> Result<Option<String>, String> {
    let out = Command::new("security")
        .args(["find-generic-password", "-s", SERVICE, "-a", CF_ACCOUNT, "-w"])
        .output()
        .map_err(|e| e.to_string())?;
    if out.status.success() {
        let json = String::from_utf8_lossy(&out.stdout).trim().to_string();
        Ok(Some(json))
    } else {
        let stderr = String::from_utf8_lossy(&out.stderr).to_lowercase();
        if stderr.contains("could not be found") || stderr.contains("no such keychain item") {
            Ok(None)
        } else {
            Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
        }
    }
}

#[tauri::command]
pub fn save_cf_token(json: String) -> Result<(), String> {
    let _ = Command::new("security")
        .args(["delete-generic-password", "-s", SERVICE, "-a", CF_ACCOUNT])
        .output();

    let out = Command::new("security")
        .args(["add-generic-password", "-s", SERVICE, "-a", CF_ACCOUNT, "-w", &json])
        .output()
        .map_err(|e| e.to_string())?;

    if out.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
    }
}

#[tauri::command]
pub fn delete_cf_token() -> Result<(), String> {
    let _ = Command::new("security")
        .args(["delete-generic-password", "-s", SERVICE, "-a", CF_ACCOUNT])
        .output();
    Ok(())
}
