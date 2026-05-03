use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Serialize)]
struct QueryBody {
    sql: String,
    params: Vec<Value>,
}

#[derive(Deserialize)]
struct D1Response {
    success: bool,
    result: Option<Vec<D1Result>>,
    errors: Option<Vec<D1Error>>,
}

#[derive(Deserialize)]
struct D1Result {
    results: Vec<Value>,
}

#[derive(Deserialize)]
struct D1Error {
    message: String,
}

#[tauri::command]
pub async fn query_d1(
    account_id: String,
    database_id: String,
    api_token: String,
    sql: String,
    params: Vec<Value>,
) -> Result<String, String> {
    let url = format!(
        "https://api.cloudflare.com/client/v4/accounts/{}/d1/database/{}/query",
        account_id, database_id
    );

    let client = reqwest::Client::new();
    let resp = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", api_token))
        .json(&QueryBody { sql, params })
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let d1: D1Response = resp.json().await.map_err(|e| e.to_string())?;

    if !d1.success {
        let msg = d1
            .errors
            .and_then(|e| e.into_iter().next())
            .map(|e| e.message)
            .unwrap_or_else(|| "Unknown D1 error".to_string());
        return Err(msg);
    }

    let rows = d1
        .result
        .and_then(|r| r.into_iter().next())
        .map(|r| r.results)
        .unwrap_or_default();

    serde_json::to_string(&rows).map_err(|e| e.to_string())
}
