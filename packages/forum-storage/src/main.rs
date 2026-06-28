use std::{
    net::SocketAddr,
    path::PathBuf,
    sync::Arc,
};

use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use storage_bindings::{download_stream, upload_file, DownloadStreamOptions, LogLevel, StorageConfig, StorageNode, UploadOptions};
use tempfile::tempdir;
use tokio::sync::Mutex;
use tower_http::cors::CorsLayer;

#[derive(Clone)]
struct AppState {
    node: Arc<Mutex<Option<StorageNode>>>,
    data_dir: PathBuf,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UploadRequest {
    ciphertext: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct UploadResponse {
    manifest_uri: String,
    tree_cid: String,
    ciphertext_hash: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct HealthResponse {
    status: &'static str,
    logos_ready: bool,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    let listen = std::env::var("FORUM_STORAGE_LISTEN").unwrap_or_else(|_| "127.0.0.1:3022".to_string());
    let data_dir = std::env::var("FORUM_STORAGE_DATA_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| std::env::temp_dir().join("creaton-forum-storage"));

    let state = AppState {
        node: Arc::new(Mutex::new(None)),
        data_dir,
    };

    ensure_node(&state).await?;

    let app = Router::new()
        .route("/health", get(health))
        .route("/v1/blobs/upload", post(upload_blob))
        .route("/v1/blobs/{manifest_uri}", get(fetch_blob))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let addr: SocketAddr = listen.parse()?;
    tracing::info!("forum-storage listening on {addr}");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}

async fn ensure_node(state: &AppState) -> Result<(), Box<dyn std::error::Error>> {
    let mut guard = state.node.lock().await;
    if guard.is_some() {
        return Ok(());
    }

    std::fs::create_dir_all(&state.data_dir)?;
    let config = StorageConfig::new()
        .log_level(LogLevel::Info)
        .data_dir(state.data_dir.clone())
        .storage_quota(5 * 1024 * 1024 * 1024)
        .max_peers(50)
        .discovery_port(8090);

    let node = StorageNode::new(config).await?;
    node.start().await?;
    *guard = Some(node);
    Ok(())
}

async fn health(State(state): State<AppState>) -> Json<HealthResponse> {
    let logos_ready = ensure_node(&state).await.is_ok();
    Json(HealthResponse {
        status: if logos_ready { "ok" } else { "degraded" },
        logos_ready,
    })
}

async fn upload_blob(
    State(state): State<AppState>,
    Json(body): Json<UploadRequest>,
) -> Result<Json<UploadResponse>, StatusCode> {
    ensure_node(&state).await.map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
    let ciphertext = URL_SAFE_NO_PAD
        .decode(body.ciphertext.as_bytes())
        .map_err(|_| StatusCode::BAD_REQUEST)?;
    let hash = Sha256::digest(&ciphertext);
    let hash_b64 = URL_SAFE_NO_PAD.encode(hash);

    let temp = tempdir().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let file_path = temp.path().join("ciphertext.bin");
    std::fs::write(&file_path, &ciphertext).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let node = state.node.lock().await;
    let node = node.as_ref().ok_or(StatusCode::SERVICE_UNAVAILABLE)?;
    let upload_result = upload_file(node, UploadOptions::new().filepath(&file_path))
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?;

    Ok(Json(UploadResponse {
        manifest_uri: format!("logos://{}", upload_result.cid),
        tree_cid: upload_result.cid,
        ciphertext_hash: hash_b64,
    }))
}

async fn fetch_blob(
    State(state): State<AppState>,
    Path(manifest_uri): Path<String>,
) -> Result<Vec<u8>, StatusCode> {
    ensure_node(&state).await.map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
    let cid = manifest_uri
        .strip_prefix("logos://")
        .unwrap_or(manifest_uri.as_str());

    let temp = tempdir().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let download_path = temp.path().join("ciphertext.bin");

    let node = state.node.lock().await;
    let node = node.as_ref().ok_or(StatusCode::SERVICE_UNAVAILABLE)?;
    download_stream(
        node,
        cid,
        DownloadStreamOptions::new(cid).filepath(&download_path),
    )
    .await
    .map_err(|_| StatusCode::BAD_GATEWAY)?;

    std::fs::read(&download_path).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}
