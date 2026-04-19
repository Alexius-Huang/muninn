use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

const SUCCESS_HTML: &str = r#"<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Muninn — Connected</title>
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f5f5f5}
.card{background:#fff;padding:2rem 3rem;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,.1);text-align:center}
h1{margin:0 0 .5rem;font-size:1.5rem}p{margin:0;color:#666}</style></head>
<body><div class="card"><h1>Connected to Dropbox</h1><p>You can close this tab and return to Muninn.</p></div></body>
</html>"#;

/// Async TCP listener — waits for exactly one OAuth callback request on `http://localhost:<port>`.
/// Returns the full callback URL (e.g. `http://localhost:19876?code=...&state=...`).
#[tauri::command]
pub async fn wait_for_oauth_callback(port: u16) -> Result<String, String> {
    let listener = TcpListener::bind(format!("127.0.0.1:{port}"))
        .await
        .map_err(|e| e.to_string())?;

    let (mut stream, _) = listener.accept().await.map_err(|e| e.to_string())?;

    let mut buf = vec![0u8; 4096];
    let n = stream.read(&mut buf).await.map_err(|e| e.to_string())?;
    let request = String::from_utf8_lossy(&buf[..n]);

    // First line: "GET /?code=...&state=... HTTP/1.1"
    let path = request
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .unwrap_or("/");

    let callback_url = format!("http://localhost:{port}{path}");

    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        SUCCESS_HTML.len(),
        SUCCESS_HTML
    );
    let _ = stream.write_all(response.as_bytes()).await;

    Ok(callback_url)
}
