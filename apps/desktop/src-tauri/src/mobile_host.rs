//! Shared remote host. Native checks supplement the command ACL, never replace it.
use serde::{Deserialize, Serialize};
use std::{
    collections::VecDeque,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};
use tauri::{Manager, State, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_opener::OpenerExt;

// Seeds HostState.origin at startup for internal QA builds (staging/development,
// and pinned production builds) that still compile with a fixed origin. A
// `--universal` production build (see native-host.mjs) omits this entirely,
// so HostState.origin starts empty and the local shell prompts the user.
#[cfg(mobile)]
const COMPILED_ORIGIN: Option<&str> = option_env!("ATLAS_NATIVE_ORIGIN");
#[cfg(desktop)]
const COMPILED_ORIGIN: Option<&str> = None;
#[cfg(mobile)]
const VERSION: &str = match option_env!("ATLAS_NATIVE_VERSION") {
    Some(value) => value,
    None => env!("CARGO_PKG_VERSION"),
};
#[cfg(desktop)]
const VERSION: &str = env!("CARGO_PKG_VERSION");
const USER_AGENT: &str = "Mozilla/5.0 RunlyNativeHost/1.0";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeEvent {
    id: u64,
    kind: String,
    target_id: String,
}

#[derive(Default)]
pub struct HostState {
    events: Mutex<VecDeque<NativeEvent>>,
    next_id: AtomicU64,
    generation: AtomicU64,
    fallback: Mutex<Option<Url>>,
    // The currently trusted server origin, if any. `None` means the local
    // shell must prompt the user to connect before any remote page can load.
    origin: Mutex<Option<String>>,
    // A candidate origin that passed preflight but hasn't been confirmed by
    // the user yet. Lives only in memory — lost if the app is killed before
    // confirmation, by design (see spec's error-handling section).
    pending_origin: Mutex<Option<SavedServer>>,
    servers: Mutex<ServerRegistry>,
    storage_error: Mutex<bool>,
    // Bumped at the start of every host_connect call. A call whose preflight
    // resolves after a newer call has started must not act on stale results —
    // see the race this guards against in the commit that introduced it.
    connect_generation: AtomicU64,
}

#[derive(Clone, Deserialize, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SavedServer {
    origin: String,
    name: String,
}

#[derive(Clone, Deserialize, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ServerRegistry {
    #[serde(default)]
    instances: Vec<SavedServer>,
    active_origin: Option<String>,
    #[serde(default)]
    configured: bool,
}

impl ServerRegistry {
    fn select(&mut self, server: SavedServer) -> Result<(), String> {
        if let Some(saved) = self
            .instances
            .iter_mut()
            .find(|s| s.origin == server.origin)
        {
            saved.name = server.name.clone();
        } else {
            if self.instances.len() >= 20 {
                return Err("INSTANCE_LIMIT".into());
            }
            self.instances.push(server.clone());
        }
        self.active_origin = Some(server.origin);
        self.configured = true;
        Ok(())
    }

    fn remove(&mut self, origin: &str) {
        self.instances.retain(|s| s.origin != origin);
        if self.active_origin.as_deref() == Some(origin) {
            self.active_origin = None;
        }
        self.configured = true;
    }
}

pub fn allowed_remote(url: &Url, origin: &str) -> bool {
    url.origin().ascii_serialization() == origin
        && url.username().is_empty()
        && url.password().is_none()
        && url.path().starts_with("/app/")
}

// Validates a candidate server origin before it's ever trusted: HTTPS only,
// no credentials/port/path/query/fragment. Returns the normalized origin
// (scheme://host, no trailing slash) on success.
pub fn validate_origin_format(input: &str) -> Result<String, &'static str> {
    let url = Url::parse(input).map_err(|_| "INVALID_ORIGIN")?;
    if url.scheme() != "https"
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some()
        || !(url.path().is_empty() || url.path() == "/")
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err("INVALID_ORIGIN");
    }
    Ok(url.origin().ascii_serialization())
}

fn local_shell(url: &Url) -> bool {
    if cfg!(debug_assertions) && url.origin().ascii_serialization() == "http://localhost:5174" {
        return ["/", "/index.html"].contains(&url.path());
    }
    ((url.scheme() == "tauri" && url.host_str() == Some("localhost"))
        || (["http", "https"].contains(&url.scheme()) && url.host_str() == Some("tauri.localhost")))
        && ["/", "/index.html"].contains(&url.path())
        && url.username().is_empty()
        && url.password().is_none()
        && url.port().is_none()
}

pub(crate) fn check_remote(window: &WebviewWindow) -> Result<(), String> {
    let state = window.state::<Arc<HostState>>();
    let origin = state
        .origin
        .lock()
        .unwrap()
        .clone()
        .ok_or("NO_ORIGIN_CONFIGURED")?;
    if window.label() == "main"
        && allowed_remote(&window.url().map_err(|_| "URL_UNAVAILABLE")?, &origin)
    {
        Ok(())
    } else {
        Err("UNTRUSTED_CONTEXT".into())
    }
}

pub fn parse_deep_link(url: &Url) -> Option<(String, String)> {
    if url.scheme() != "runly"
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return None;
    }
    let kind = url.host_str()?;
    if !["chat", "call"].contains(&kind) {
        return None;
    }
    let id = url.path().strip_prefix('/')?;
    if id.is_empty()
        || id.len() > 128
        || !id
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_')
    {
        return None;
    }
    Some((kind.into(), id.into()))
}

impl HostState {
    fn enqueue(&self, url: &Url) {
        if let Some((kind, target_id)) = parse_deep_link(url) {
            let mut events = self.events.lock().unwrap();
            if events
                .iter()
                .any(|e| e.kind == kind && e.target_id == target_id)
            {
                return;
            }
            if events.len() >= 64 {
                events.pop_front();
            }
            events.push_back(NativeEvent {
                id: self.next_id.fetch_add(1, Ordering::SeqCst) + 1,
                kind,
                target_id,
            });
        }
    }
}

#[tauri::command]
pub fn host_info(window: WebviewWindow) -> Result<serde_json::Value, String> {
    let url = window.url().map_err(|_| "URL_UNAVAILABLE")?;
    let state = window.state::<Arc<HostState>>();
    let origin = state.origin.lock().unwrap().clone();
    let is_allowed_remote = origin
        .as_deref()
        .map(|o| allowed_remote(&url, o))
        .unwrap_or(false);
    if window.label() != "main" || !(local_shell(&url) || is_allowed_remote) {
        return Err("UNTRUSTED_CONTEXT".into());
    }
    let mut capabilities = vec![
        "host-info",
        "local-notifications",
        "deep-links",
        "external-links",
    ];
    if cfg!(mobile) {
        capabilities.push("haptics");
    }
    if cfg!(target_os = "windows") {
        capabilities.extend([
            "instance-manager",
            "device-permissions",
            "desktop-attention",
        ]);
    }
    if cfg!(target_os = "android") {
        capabilities.push("notification-actions");
        capabilities.push("screen-share");
        capabilities.push("call-keepalive");
        capabilities.push("audio-route");
        capabilities.push("instance-manager");
        capabilities.push("device-permissions");
        capabilities.push("bluetooth-paired-devices");
        capabilities.push("bluetooth-print");
        capabilities.push("nfc-reader");
    }
    Ok(serde_json::json!({
        "platform": std::env::consts::OS, "nativeHostVersion": VERSION,
        "osVersion": os_info::get().version().to_string(), "bridgeVersion": 1,
        "frontendUrl": origin.map(|o| format!("{o}/app/")),
        "capabilities": capabilities
    }))
}

fn arm_watchdog(window: WebviewWindow, state: Arc<HostState>) {
    let generation = state.generation.fetch_add(1, Ordering::SeqCst) + 1;
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(30));
        if state
            .generation
            .compare_exchange(
                generation,
                generation + 1,
                Ordering::SeqCst,
                Ordering::SeqCst,
            )
            .is_ok()
        {
            if let Some(mut fallback) = state.fallback.lock().unwrap().clone() {
                fallback.set_fragment(Some("failed"));
                let _ = window.navigate(fallback);
            }
        }
    });
}

pub fn has_frame_policy(csp: &str) -> bool {
    // CSP uses the first occurrence of a directive, not the most restrictive duplicate.
    let directive = |name: &str| {
        csp.split(';')
            .map(|d| d.split_whitespace().collect::<Vec<_>>())
            .find(|parts| parts.first().copied() == Some(name))
    };
    directive("frame-src") == Some(vec!["frame-src", "'none'"])
        && directive("object-src") == Some(vec!["object-src", "'none'"])
}

async fn preflight(origin: &str) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .redirect(reqwest::redirect::Policy::none())
        .user_agent(USER_AGENT)
        .build()
        .map_err(|_| "NETWORK_INIT")?;
    let target = format!("{origin}/app/");
    let response = client
        .get(&target)
        .header("Cache-Control", "no-cache")
        .send()
        .await
        .map_err(|_| "NETWORK_TLS_OR_TIMEOUT")?;
    if !response.status().is_success() {
        return Err(format!("HTTP_{}", response.status().as_u16()));
    }
    let protected = response
        .headers()
        .get_all("content-security-policy")
        .iter()
        .any(|h| h.to_str().map(has_frame_policy).unwrap_or(false));
    if !protected {
        return Err("MISSING_NATIVE_FRAME_POLICY".into());
    }
    Ok(())
}

fn navigate_to_origin(
    window: &WebviewWindow,
    state: &Arc<HostState>,
    origin: &str,
) -> Result<(), String> {
    arm_watchdog(window.clone(), state.clone());
    let target = format!("{origin}/app/");
    window
        .navigate(Url::parse(&target).map_err(|_| "INVALID_FRONTEND")?)
        .map_err(|_| "NAVIGATION_FAILED".into())
}

#[cfg(target_os = "android")]
async fn persist_servers(app: tauri::AppHandle, registry: &ServerRegistry) -> Result<(), String> {
    super::mobile_media::set_servers(app, serde_json::to_value(registry).unwrap()).await
}

#[cfg(target_os = "ios")]
async fn persist_servers(_app: tauri::AppHandle, _registry: &ServerRegistry) -> Result<(), String> {
    Ok(())
}

#[cfg(target_os = "android")]
fn load_servers(app: tauri::AppHandle) -> ServerRegistry {
    let registry = tauri::async_runtime::block_on(super::mobile_media::get_servers(app))
        .ok()
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();
    seed_registry(registry)
}

#[cfg(target_os = "ios")]
fn load_servers(_app: tauri::AppHandle) -> ServerRegistry {
    seed_registry(ServerRegistry::default())
}

#[cfg(desktop)]
async fn persist_servers(app: tauri::AppHandle, registry: &ServerRegistry) -> Result<(), String> {
    use tauri_plugin_store::StoreExt;
    let store = app.store("instances.json").map_err(|_| "STORAGE_FAILED")?;
    let previous = store.get("registry");
    store.set(
        "registry",
        serde_json::to_value(registry).map_err(|_| "STORAGE_FAILED")?,
    );
    if store.save().is_err() {
        if let Some(previous) = previous {
            store.set("registry", previous);
        } else {
            store.delete("registry");
        }
        return Err("STORAGE_FAILED".into());
    }
    Ok(())
}

#[cfg(desktop)]
fn load_servers(app: tauri::AppHandle) -> Result<ServerRegistry, String> {
    use tauri_plugin_store::StoreExt;
    let store = app.store("instances.json").map_err(|_| "STORAGE_FAILED")?;
    if let Some(value) = store.get("registry") {
        let registry = serde_json::from_value(value).map_err(|_| "STORAGE_FAILED")?;
        return Ok(seed_registry(registry));
    }
    // Preserve the previous picker's saved address; reconnect still performs preflight.
    let mut registry = ServerRegistry::default();
    if let Some(origin) = app
        .store("store.json")
        .ok()
        .and_then(|store| store.get("serverUrl"))
        .and_then(|value| {
            value
                .as_str()
                .and_then(|value| validate_origin_format(value).ok())
        })
    {
        registry.instances.push(SavedServer {
            origin,
            name: "Instancia anterior".into(),
        });
        registry.configured = true;
    }
    Ok(seed_registry(registry))
}

fn seed_registry(mut registry: ServerRegistry) -> ServerRegistry {
    registry
        .instances
        .retain(|s| validate_origin_format(&s.origin).is_ok());
    registry.instances.truncate(20);
    if !registry.configured {
        if let Some(origin) = COMPILED_ORIGIN {
            let _ = registry.select(SavedServer {
                origin: origin.into(),
                name: "Runly".into(),
            });
        }
    }
    if !registry
        .instances
        .iter()
        .any(|s| Some(&s.origin) == registry.active_origin.as_ref())
    {
        registry.active_origin = None;
    }
    registry
}

fn check_local(window: &WebviewWindow) -> Result<(), String> {
    if window.label() == "main" && local_shell(&window.url().map_err(|_| "URL_UNAVAILABLE")?) {
        Ok(())
    } else {
        Err("LOCAL_ONLY".into())
    }
}

pub(crate) fn check_host(window: &WebviewWindow) -> Result<(), String> {
    if check_local(window).is_ok() {
        Ok(())
    } else {
        check_remote(window)
    }
}

fn activate(state: &HostState, registry: ServerRegistry) {
    *state.storage_error.lock().unwrap() = false;
    let changed = *state.origin.lock().unwrap() != registry.active_origin;
    *state.origin.lock().unwrap() = registry.active_origin.clone();
    *state.servers.lock().unwrap() = registry;
    *state.pending_origin.lock().unwrap() = None;
    if changed {
        state.events.lock().unwrap().clear();
    }
}

#[tauri::command]
pub fn host_servers(
    window: WebviewWindow,
    state: State<'_, Arc<HostState>>,
) -> Result<ServerRegistry, String> {
    check_local(&window)?;
    if *state.storage_error.lock().unwrap() {
        return Err("STORAGE_FAILED".into());
    }
    Ok(state.servers.lock().unwrap().clone())
}

#[tauri::command]
pub fn host_cancel_origin(
    window: WebviewWindow,
    state: State<'_, Arc<HostState>>,
) -> Result<(), String> {
    check_local(&window)?;
    state.connect_generation.fetch_add(1, Ordering::SeqCst);
    *state.pending_origin.lock().unwrap() = None;
    Ok(())
}

#[tauri::command]
pub async fn host_remove_server(
    window: WebviewWindow,
    state: State<'_, Arc<HostState>>,
    origin: String,
) -> Result<(), String> {
    check_local(&window)?;
    let mut registry = state.servers.lock().unwrap().clone();
    registry.remove(&validate_origin_format(&origin)?);
    persist_servers(window.app_handle().clone(), &registry).await?;
    activate(&state, registry);
    Ok(())
}

#[tauri::command]
pub async fn host_manage(
    window: WebviewWindow,
    state: State<'_, Arc<HostState>>,
    section: Option<String>,
) -> Result<(), String> {
    check_remote(&window)?;
    state.generation.fetch_add(1, Ordering::SeqCst);
    state.connect_generation.fetch_add(1, Ordering::SeqCst);
    #[cfg(target_os = "android")]
    super::mobile_media::stop_for_manager(window.app_handle().clone()).await?;
    let mut target = state
        .fallback
        .lock()
        .unwrap()
        .clone()
        .ok_or("SHELL_UNAVAILABLE")?;
    target.set_fragment(Some(if section.as_deref() == Some("device") {
        "device"
    } else {
        "manage"
    }));
    window
        .navigate(target)
        .map_err(|_| "NAVIGATION_FAILED".into())
}

#[tauri::command]
pub async fn host_connect(
    window: WebviewWindow,
    state: State<'_, Arc<HostState>>,
    origin: Option<String>,
    name: Option<String>,
) -> Result<serde_json::Value, String> {
    let local = window.url().map_err(|_| "URL_UNAVAILABLE")?;
    if window.label() != "main" || !local_shell(&local) {
        return Err("LOCAL_ONLY".into());
    }
    *state.fallback.lock().unwrap() = Some(local);

    let my_generation = state.connect_generation.fetch_add(1, Ordering::SeqCst) + 1;
    *state.pending_origin.lock().unwrap() = None;
    let candidate = match origin {
        Some(value) => validate_origin_format(&value)?,
        None => state
            .origin
            .lock()
            .unwrap()
            .clone()
            .ok_or("NO_ORIGIN_CONFIGURED")?,
    };

    preflight(&candidate).await?;
    if state.connect_generation.load(Ordering::SeqCst) != my_generation {
        return Err("SUPERSEDED".into());
    }

    let registry = state.servers.lock().unwrap().clone();
    let saved = registry
        .instances
        .iter()
        .find(|s| s.origin == candidate)
        .cloned();
    let server = SavedServer {
        origin: candidate.clone(),
        name: name
            .unwrap_or_else(|| {
                saved
                    .as_ref()
                    .map(|s| s.name.clone())
                    .unwrap_or_else(|| candidate.clone())
            })
            .trim()
            .chars()
            .take(80)
            .collect(),
    };
    if saved.is_none() {
        if registry.instances.len() >= 20 {
            return Err("INSTANCE_LIMIT".into());
        }
        *state.pending_origin.lock().unwrap() = Some(server);
        return Ok(serde_json::json!({ "status": "pending_confirmation", "origin": candidate }));
    }
    let mut registry = registry;
    registry.select(server)?;
    persist_servers(window.app_handle().clone(), &registry).await?;
    activate(&state, registry);
    navigate_to_origin(&window, state.inner(), &candidate)?;
    Ok(serde_json::json!({ "status": "connected" }))
}

#[tauri::command]
pub async fn host_confirm_origin(
    window: WebviewWindow,
    state: State<'_, Arc<HostState>>,
) -> Result<(), String> {
    let local = window.url().map_err(|_| "URL_UNAVAILABLE")?;
    if window.label() != "main" || !local_shell(&local) {
        return Err("LOCAL_ONLY".into());
    }
    let origin = state
        .pending_origin
        .lock()
        .unwrap()
        .clone()
        .ok_or("NO_PENDING_ORIGIN")?;
    let mut registry = state.servers.lock().unwrap().clone();
    registry.select(origin.clone())?;
    persist_servers(window.app_handle().clone(), &registry).await?;
    activate(&state, registry);
    navigate_to_origin(&window, state.inner(), &origin.origin)
}

#[tauri::command]
pub async fn host_forget_origin(
    window: WebviewWindow,
    state: State<'_, Arc<HostState>>,
) -> Result<(), String> {
    let local = window.url().map_err(|_| "URL_UNAVAILABLE")?;
    if window.label() != "main" || !local_shell(&local) {
        return Err("LOCAL_ONLY".into());
    }
    state.connect_generation.fetch_add(1, Ordering::SeqCst);
    let registry = ServerRegistry {
        configured: true,
        ..Default::default()
    };
    persist_servers(window.app_handle().clone(), &registry).await?;
    activate(&state, registry);
    Ok(())
}

#[tauri::command]
pub fn host_ready(window: WebviewWindow, state: State<'_, Arc<HostState>>) -> Result<(), String> {
    check_remote(&window)?;
    state.generation.fetch_add(1, Ordering::SeqCst);
    Ok(())
}

#[tauri::command]
pub fn host_events(
    window: WebviewWindow,
    state: State<'_, Arc<HostState>>,
) -> Result<Vec<NativeEvent>, String> {
    check_remote(&window)?;
    Ok(state.events.lock().unwrap().iter().cloned().collect())
}

#[tauri::command]
pub fn host_ack_events(
    window: WebviewWindow,
    state: State<'_, Arc<HostState>>,
    ids: Vec<u64>,
) -> Result<(), String> {
    check_remote(&window)?;
    if ids.len() > 64 {
        return Err("TOO_MANY_EVENTS".into());
    }
    state
        .events
        .lock()
        .unwrap()
        .retain(|event| !ids.contains(&event.id));
    Ok(())
}

#[tauri::command]
pub fn host_open_external(window: WebviewWindow, url: String) -> Result<(), String> {
    check_remote(&window)?;
    let parsed = Url::parse(&url).map_err(|_| "INVALID_URL")?;
    if !["http", "https"].contains(&parsed.scheme())
        || !parsed.username().is_empty()
        || parsed.password().is_some()
    {
        return Err("INVALID_EXTERNAL_URL".into());
    }
    window
        .opener()
        .open_url(parsed.as_str(), None::<&str>)
        .map_err(|_| "OPEN_FAILED".into())
}

pub fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let state = Arc::new(HostState::default());
    #[cfg(desktop)]
    let loaded = load_servers(app.handle().clone());
    #[cfg(mobile)]
    let loaded: Result<ServerRegistry, String> = Ok(load_servers(app.handle().clone()));
    let storage_error = loaded.is_err();
    let registry = loaded.unwrap_or_default();
    activate(&state, registry);
    *state.storage_error.lock().unwrap() = storage_error;
    app.manage(state.clone());
    let events = state.clone();
    app.deep_link().on_open_url(move |event| {
        for url in event.urls() {
            events.enqueue(&url);
        }
    });
    if let Some(urls) = app.deep_link().get_current()? {
        for url in urls {
            state.enqueue(&url);
        }
    }
    let handle = app.handle().clone();
    let metadata = serde_json::json!({ "platform": std::env::consts::OS, "bridgeVersion": 1 });
    let device_bridge = include_str!("../../native-host/device-bridge.js");
    let init = format!("Object.defineProperty(window, '__RUNLY_NATIVE_HOST__', {{value: Object.freeze({metadata}), writable:false}});{device_bridge}");
    let nav_state = state.clone();
    let builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
        .title("Runly")
        .inner_size(1180.0, 800.0)
        .min_inner_size(720.0, 600.0)
        .user_agent(USER_AGENT)
        .initialization_script(init)
        .on_navigation(move |url| {
            let trusted = nav_state.origin.lock().unwrap().clone();
            if local_shell(url)
                || trusted
                    .as_deref()
                    .map(|o| allowed_remote(url, o))
                    .unwrap_or(false)
            {
                return true;
            }
            if ["http", "https"].contains(&url.scheme())
                && url.username().is_empty()
                && url.password().is_none()
            {
                let _ = handle.opener().open_url(url.as_str(), None::<&str>);
            }
            false
        })
        .on_page_load(move |window, payload| {
            #[cfg(target_os = "android")]
            if matches!(payload.event(), tauri::webview::PageLoadEvent::Started) {
                super::mobile_media::stop_on_navigation(window.app_handle().clone());
            }
            let trusted = state.origin.lock().unwrap().clone();
            if matches!(payload.event(), tauri::webview::PageLoadEvent::Started)
                && trusted
                    .as_deref()
                    .map(|o| allowed_remote(payload.url(), o))
                    .unwrap_or(false)
            {
                arm_watchdog(window, state.clone());
            }
        });
    let window = builder.build()?;
    *app.state::<Arc<HostState>>().fallback.lock().unwrap() = Some(window.url()?);
    #[cfg(desktop)]
    {
        use tauri::menu::{Menu, MenuItem, Submenu};
        let instances =
            MenuItem::with_id(app, "instances", "Cambiar instancia", true, None::<&str>)?;
        let device = MenuItem::with_id(
            app,
            "device",
            "Permisos del dispositivo",
            true,
            None::<&str>,
        )?;
        let menu = Submenu::with_items(app, "Runly", true, &[&instances, &device])?;
        app.set_menu(Menu::with_items(app, &[&menu])?)?;
        app.on_menu_event(move |app, event| {
            let state = app.state::<Arc<HostState>>();
            if let Some(mut target) = state.fallback.lock().unwrap().clone() {
                state.generation.fetch_add(1, Ordering::SeqCst);
                state.connect_generation.fetch_add(1, Ordering::SeqCst);
                target.set_fragment(Some(if event.id().as_ref() == "device" {
                    "device"
                } else {
                    "manage"
                }));
                let _ = window.navigate(target);
            };
        });
    }
    Ok(())
}

/// Bluetooth print payload sent to the Android host: a MAC address and base64
/// bytes (at most ~2 MiB decoded). Kotlin re-checks both.
#[allow(dead_code)]
pub fn valid_bluetooth_print(address: &str, data: &str) -> bool {
    let parts: Vec<&str> = address.split(':').collect();
    parts.len() == 6
        && parts
            .iter()
            .all(|p| p.len() == 2 && p.chars().all(|c| c.is_ascii_hexdigit()))
        && !data.is_empty()
        && data.len() <= 2_800_000
        && data
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'+' | b'/' | b'='))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(desktop)]
    #[test]
    fn desktop_acl_accepts_webview2_origin_without_document_path() {
        use tauri::utils::acl::ExecutionContext;
        let capability: serde_json::Value =
            serde_json::from_str(include_str!("../capabilities/desktop-remote.json")).unwrap();
        let pattern = capability["remote"]["urls"][0].as_str().unwrap();
        let context = ExecutionContext::Remote {
            url: pattern.parse().unwrap(),
        };
        let ExecutionContext::Remote { url } = context else {
            unreachable!()
        };
        assert!(url.test(&Url::parse("https://tenant.example.com/").unwrap()));
        assert!(!url.test(&Url::parse("http://tenant.example.com/").unwrap()));
        assert!(!allowed_remote(
            &Url::parse("https://tenant.example.com/").unwrap(),
            "https://tenant.example.com"
        ));
        assert!(!allowed_remote(
            &Url::parse("https://other.example.com/app/").unwrap(),
            "https://tenant.example.com"
        ));
    }
    #[test]
    fn registry_switch_and_remove_preserve_other_instances() {
        let mut registry = ServerRegistry::default();
        for name in ["a", "b"] {
            registry
                .select(SavedServer {
                    origin: format!("https://{name}.example.com"),
                    name: name.into(),
                })
                .unwrap();
        }
        assert_eq!(registry.instances.len(), 2);
        assert_eq!(
            registry.active_origin.as_deref(),
            Some("https://b.example.com")
        );
        registry.remove("https://b.example.com");
        assert_eq!(registry.instances.len(), 1);
        assert_eq!(registry.active_origin, None);
        assert!(registry.configured);
    }

    #[test]
    fn switching_origin_discards_events_from_previous_instance() {
        let state = HostState::default();
        state.enqueue(&Url::parse("runly://call/a").unwrap());
        let mut registry = ServerRegistry::default();
        registry
            .select(SavedServer {
                origin: "https://b.example.com".into(),
                name: "B".into(),
            })
            .unwrap();
        activate(&state, registry);
        assert!(state.events.lock().unwrap().is_empty());
    }

    #[test]
    fn registry_is_bounded_and_updates_existing_name() {
        let mut registry = ServerRegistry::default();
        for n in 0..20 {
            registry
                .select(SavedServer {
                    origin: format!("https://i{n}.example.com"),
                    name: "Test".into(),
                })
                .unwrap();
        }
        assert!(registry
            .select(SavedServer {
                origin: "https://extra.example.com".into(),
                name: "Extra".into()
            })
            .is_err());
        registry
            .select(SavedServer {
                origin: "https://i0.example.com".into(),
                name: "Renamed".into(),
            })
            .unwrap();
        assert_eq!(registry.instances[0].name, "Renamed");
        let reset = ServerRegistry {
            configured: true,
            ..Default::default()
        };
        assert!(seed_registry(reset).active_origin.is_none());
    }
    #[test]
    fn exact_origin_and_app_path() {
        for value in [
            "https://atlas.example.com.evil/app/",
            "http://atlas.example.com/app/",
            "https://atlas.example.com:444/app/",
            "https://user@atlas.example.com/app/",
            "https://atlas.example.com/public/file",
        ] {
            assert!(!allowed_remote(
                &Url::parse(value).unwrap(),
                "https://atlas.example.com"
            ));
        }
        assert!(allowed_remote(
            &Url::parse("https://atlas.example.com/app/login").unwrap(),
            "https://atlas.example.com"
        ));
    }
    #[test]
    fn events_survive_reads_and_deduplicate() {
        let state = HostState::default();
        let url = Url::parse("runly://call/abc-123").unwrap();
        state.enqueue(&url);
        state.enqueue(&url);
        assert_eq!(state.events.lock().unwrap().len(), 1);
        assert!(parse_deep_link(&Url::parse("runly://call/abc?token=secret").unwrap()).is_none());
        assert!(parse_deep_link(&Url::parse("runly://chat/a%2Fb").unwrap()).is_none());
    }
    #[test]
    fn require_real_frame_directive() {
        assert!(!has_frame_policy(
            "frame-src *; frame-src 'none'; object-src 'none'"
        ));
        assert!(has_frame_policy("frame-src 'none'; object-src 'none';"));
        assert!(!has_frame_policy(
            "frame-src 'none' https:; object-src 'none'"
        ));
        assert!(!has_frame_policy(
            "report-uri /frame-src 'none'; object-src 'none'"
        ));
    }

    #[test]
    fn validate_origin_format_accepts_bare_https_origin() {
        assert_eq!(
            validate_origin_format("https://runly.example.com").unwrap(),
            "https://runly.example.com"
        );
        assert_eq!(
            validate_origin_format("https://runly.example.com/").unwrap(),
            "https://runly.example.com"
        );
    }

    #[test]
    fn validate_origin_format_rejects_unsafe_variants() {
        for input in [
            "http://runly.example.com",
            "https://user@runly.example.com",
            "https://runly.example.com:8443",
            "https://runly.example.com/app",
            "https://runly.example.com?x=1",
            "https://runly.example.com#frag",
            "not a url",
        ] {
            assert!(
                validate_origin_format(input).is_err(),
                "expected {input} to be rejected"
            );
        }
    }
    #[test]
    fn bluetooth_print_payload_is_bounded() {
        assert!(valid_bluetooth_print("00:1A:2b:3C:4D:5E", "XlhB"));
        assert!(!valid_bluetooth_print("00:1A:2B:3C:4D", "XlhB"));
        assert!(!valid_bluetooth_print("00:1A:2B:3C:4D:ZZ", "XlhB"));
        assert!(!valid_bluetooth_print("00:1A:2B:3C:4D:5E", ""));
        assert!(!valid_bluetooth_print("00:1A:2B:3C:4D:5E", "Xl hB"));
        assert!(!valid_bluetooth_print(
            "00:1A:2B:3C:4D:5E",
            &"A".repeat(2_800_001)
        ));
    }
}
