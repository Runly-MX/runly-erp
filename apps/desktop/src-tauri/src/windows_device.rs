//! Windows controls expose named settings pages, never arbitrary processes or URIs.
use tauri::WebviewWindow;

#[tauri::command]
pub fn host_device(
    window: WebviewWindow,
    action: String,
    permission: Option<String>,
) -> Result<serde_json::Value, String> {
    super::mobile_host::check_host(&window)?;
    if action == "status" {
        return Ok(serde_json::json!({
            "camera": { "available": true, "state": "per-session" },
            "microphone": { "available": true, "state": "per-session" },
            "screen": { "available": true, "state": "per-session" },
            "bluetooth": { "available": true, "state": "system" },
            "notifications": { "available": true, "state": "system" },
            "nfc": { "available": false, "state": "unsupported" }
        }));
    }
    if action != "settings" {
        return Err("UNSUPPORTED_DEVICE_ACTION".into());
    }
    let uri = match permission.as_deref() {
        Some("camera") => "ms-settings:privacy-webcam",
        Some("microphone") => "ms-settings:privacy-microphone",
        Some("bluetooth") => "ms-settings:bluetooth",
        Some("notifications") => "ms-settings:notifications",
        Some("sound") => "ms-settings:sound",
        None => "ms-settings:privacy",
        _ => return Err("INVALID_PERMISSION".into()),
    };
    std::process::Command::new("explorer.exe")
        .arg(uri)
        .spawn()
        .map_err(|_| "SETTINGS_FAILED")?;
    Ok(serde_json::json!({ "opened": true }))
}
