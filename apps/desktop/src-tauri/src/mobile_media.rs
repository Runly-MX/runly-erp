use serde_json::{json, Value};
use tauri::{
    plugin::{Builder, PluginHandle, TauriPlugin},
    AppHandle, Manager, WebviewWindow, Wry,
};

struct MediaHandle(PluginHandle<Wry>);

pub fn stop_on_navigation(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let _ = run(app, "stop", json!({})).await;
    });
}

pub async fn get_servers(app: AppHandle) -> Result<Value, String> {
    run(app, "getServers", json!({})).await
}

pub async fn set_servers(app: AppHandle, registry: Value) -> Result<(), String> {
    run(app, "setServers", registry).await?;
    Ok(())
}

pub async fn stop_for_manager(app: AppHandle) -> Result<(), String> {
    run(app.clone(), "stop", json!({})).await?;
    run(app, "callKeepAliveStop", json!({})).await?;
    Ok(())
}

#[tauri::command]
pub async fn host_device(
    window: WebviewWindow,
    app: AppHandle,
    action: String,
    permission: Option<String>,
    address: Option<String>,
    data: Option<String>,
) -> Result<Value, String> {
    super::mobile_host::check_host(&window)?;
    if action == "bluetooth-print" {
        let address = address.unwrap_or_default();
        let data = data.unwrap_or_default();
        if !super::mobile_host::valid_bluetooth_print(&address, &data) {
            return Err("INVALID_PRINT_DATA".into());
        }
        return run(
            app,
            "bluetoothPrint",
            json!({ "address": address, "data": data }),
        )
        .await;
    }
    let command = match action.as_str() {
        "status" => "deviceStatus",
        "request" => "deviceRequest",
        "settings" => "deviceSettings",
        "bluetooth-paired" => "bluetoothPaired",
        "nfc-read" => "nfcRead",
        "nfc-stop" => "nfcStop",
        _ => return Err("INVALID_DEVICE_ACTION".into()),
    };
    run(app, command, json!({ "permission": permission })).await
}

pub fn init() -> TauriPlugin<Wry> {
    Builder::new("runly-media")
        .setup(|app, api| {
            app.manage(MediaHandle(api.register_android_plugin(
                "com.racoondevs.runlyerp",
                "ScreenSharePlugin",
            )?));
            Ok(())
        })
        .build()
}

async fn run(app: AppHandle, command: &'static str, payload: Value) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<MediaHandle>()
            .0
            .run_mobile_plugin(command, payload)
            .map_err(|error| error.to_string())
    })
    .await
    .map_err(|_| "NATIVE_MEDIA_FAILED".to_string())?
}

#[tauri::command]
pub async fn host_notification_show(
    window: WebviewWindow,
    app: AppHandle,
    options: Value,
) -> Result<Value, String> {
    super::mobile_host::check_remote(&window)?;
    run(app, "notify", options).await
}

#[tauri::command]
pub async fn host_screen_start(
    window: WebviewWindow,
    app: AppHandle,
    session: Value,
) -> Result<Value, String> {
    super::mobile_host::check_remote(&window)?;
    let url = tauri::Url::parse(session["livekitUrl"].as_str().unwrap_or(""))
        .map_err(|_| "INVALID_MEDIA_URL")?;
    if (url.scheme() != "wss" && !(cfg!(debug_assertions) && url.scheme() == "ws"))
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err("INVALID_MEDIA_URL".into());
    }
    if session["token"]
        .as_str()
        .map_or(true, |token| token.is_empty() || token.len() > 8192)
    {
        return Err("INVALID_MEDIA_TOKEN".into());
    }
    run(app, "start", session).await
}

#[tauri::command]
pub async fn host_screen_stop(window: WebviewWindow, app: AppHandle) -> Result<Value, String> {
    super::mobile_host::check_remote(&window)?;
    run(app, "stop", json!({})).await
}

#[tauri::command]
pub async fn host_screen_status(window: WebviewWindow, app: AppHandle) -> Result<Value, String> {
    super::mobile_host::check_remote(&window)?;
    run(app, "status", json!({})).await
}

#[tauri::command]
pub async fn host_call_keepalive_start(
    window: WebviewWindow,
    app: AppHandle,
    video: bool,
) -> Result<Value, String> {
    super::mobile_host::check_remote(&window)?;
    run(app, "callKeepAliveStart", json!({ "video": video })).await
}

#[tauri::command]
pub async fn host_call_keepalive_stop(
    window: WebviewWindow,
    app: AppHandle,
) -> Result<Value, String> {
    super::mobile_host::check_remote(&window)?;
    run(app, "callKeepAliveStop", json!({})).await
}

#[tauri::command]
pub async fn host_audio_routes(window: WebviewWindow, app: AppHandle) -> Result<Value, String> {
    super::mobile_host::check_remote(&window)?;
    run(app, "audioRoutes", json!({})).await
}

#[tauri::command]
pub async fn host_audio_route_set(
    window: WebviewWindow,
    app: AppHandle,
    id: String,
) -> Result<Value, String> {
    super::mobile_host::check_remote(&window)?;
    if !["earpiece", "speaker", "wired", "bluetooth"].contains(&id.as_str()) {
        return Err("INVALID_AUDIO_ROUTE".into());
    }
    run(app, "setAudioRoute", json!({ "id": id })).await
}

#[tauri::command]
pub async fn host_audio_route_reset(window: WebviewWindow, app: AppHandle) -> Result<Value, String> {
    super::mobile_host::check_remote(&window)?;
    run(app, "resetAudioRoute", json!({})).await
}

#[tauri::command]
pub async fn host_proximity_set(
    window: WebviewWindow,
    app: AppHandle,
    enabled: bool,
) -> Result<Value, String> {
    super::mobile_host::check_remote(&window)?;
    run(app, "setProximity", json!({ "enabled": enabled })).await
}

#[tauri::command]
pub async fn host_fcm_token(window: WebviewWindow, app: AppHandle) -> Result<Value, String> {
    super::mobile_host::check_remote(&window)?;
    run(app, "currentToken", json!({})).await
}
