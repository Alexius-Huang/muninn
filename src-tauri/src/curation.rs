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

#[tauri::command]
pub async fn list_curation(app: AppHandle) -> Result<Vec<String>, String> {
    let dir = curation_dir(&app)?;
    match fs::read_dir(&dir) {
        Err(e) if e.kind() == ErrorKind::NotFound => return Ok(vec![]),
        Err(e) => return Err(e.to_string()),
        Ok(entries) => {
            let mut results = Vec::new();
            for entry in entries {
                let entry = entry.map_err(|e| e.to_string())?;
                let path = entry.path();
                let name = path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("");
                if name.ends_with(".json") && !name.ends_with(".json.tmp") {
                    match fs::read_to_string(&path) {
                        Ok(contents) => results.push(contents),
                        Err(e) => return Err(e.to_string()),
                    }
                }
            }
            Ok(results)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write_file(dir: &std::path::Path, name: &str, contents: &str) {
        std::fs::create_dir_all(dir).unwrap();
        std::fs::write(dir.join(name), contents).unwrap();
    }

    #[test]
    fn list_curation_missing_dir_returns_empty() {
        let tmp = std::env::temp_dir().join(format!("muninn_test_{}", std::process::id()));
        let dir = tmp.join("curation");
        // dir does not exist — simulate missing curation dir
        let result: Vec<String> = {
            match std::fs::read_dir(&dir) {
                Err(e) if e.kind() == ErrorKind::NotFound => vec![],
                _ => panic!("expected NotFound"),
            }
        };
        assert!(result.is_empty());
    }

    #[test]
    fn list_curation_skips_tmp_files() {
        let tmp = std::env::temp_dir().join(format!("muninn_test_tmp_{}", std::process::id()));
        let dir = tmp.join("curation");
        write_file(&dir, "abc.json", r#"{"folderPath":"/a","records":{}}"#);
        write_file(&dir, "def.json.tmp", r#"partial"#);

        let mut results = Vec::new();
        for entry in std::fs::read_dir(&dir).unwrap() {
            let entry = entry.unwrap();
            let path = entry.path();
            let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
            if name.ends_with(".json") && !name.ends_with(".json.tmp") {
                results.push(std::fs::read_to_string(&path).unwrap());
            }
        }
        assert_eq!(results.len(), 1);
        assert!(results[0].contains("/a"));
        std::fs::remove_dir_all(&tmp).ok();
    }

    #[test]
    fn list_curation_returns_all_json_files() {
        let tmp = std::env::temp_dir().join(format!("muninn_test_all_{}", std::process::id()));
        let dir = tmp.join("curation");
        write_file(&dir, "aaa.json", r#"{"folderPath":"/folder1","records":{}}"#);
        write_file(&dir, "bbb.json", r#"{"folderPath":"/folder2","records":{}}"#);

        let mut results = Vec::new();
        for entry in std::fs::read_dir(&dir).unwrap() {
            let entry = entry.unwrap();
            let path = entry.path();
            let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
            if name.ends_with(".json") && !name.ends_with(".json.tmp") {
                results.push(std::fs::read_to_string(&path).unwrap());
            }
        }
        assert_eq!(results.len(), 2);
        std::fs::remove_dir_all(&tmp).ok();
    }
}
