use std::sync::Arc;

use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    routing::{get, post},
    Json, Router,
};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use rand_chacha::{rand_core::SeedableRng, ChaCha20Rng};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio::sync::Mutex;
use tower_http::cors::CorsLayer;
use tracing::info;

use crate::{
    dkg::{run_dkg, GoldenSetup, ParticipantSpec},
    kem::{decapsulate, encapsulate, KeyCapsule},
    state::{DkgState, EpochCommitment, StateError},
};
pub struct AppState {
    pub setup: GoldenSetup,
    pub admin_token: String,
    pub state: Mutex<DkgState>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthResponse {
    pub status: &'static str,
    pub golden_setup_ready: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyGenRequest {
    pub participants: Vec<ParticipantSpec>,
    pub threshold: u32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyGenResponse {
    pub board_id: String,
    pub epoch: u64,
    pub public_key: String,
    pub commitment: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReshareRequest {
    pub participants: Vec<ParticipantSpec>,
    pub threshold: u32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PartialDecryptRequest {
    pub participant_id: String,
    pub ciphertext: String,
    pub nonce: String,
    pub capsule: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PartialDecryptResponse {
    pub partial: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EncapsulateRequest {
    pub content_key: String,
    pub context: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EncapsulateResponse {
    pub encapsulation: String,
    pub nonce: String,
    pub ciphertext: String,
    pub key_commitment: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DecryptRequest {
    pub encapsulation: String,
    pub nonce: String,
    pub ciphertext: String,
    pub key_commitment: String,
    pub participant_ids: Vec<String>,
    pub context: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DecryptResponse {
    pub content_key: String,
}

pub fn router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/v1/boards/{board_id}/key", post(create_key))
        .route("/v1/boards/{board_id}/commitment", get(get_commitment))
        .route("/v1/boards/{board_id}/reshare", post(reshare))
        .route("/v1/boards/{board_id}/partial-decrypt", post(partial_decrypt))
        .route("/v1/boards/{board_id}/encapsulate", post(encapsulate_key))
        .route("/v1/boards/{board_id}/decrypt", post(decrypt_key))
        .layer(CorsLayer::permissive())
        .with_state(state)
}

async fn health(State(_state): State<Arc<AppState>>) -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok",
        golden_setup_ready: true,
    })
}

async fn create_key(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(board_id): Path<String>,
    Json(request): Json<KeyGenRequest>,
) -> Result<Json<KeyGenResponse>, (StatusCode, Json<Value>)> {
    authorize(&headers, &state.admin_token)?;
    let epoch = 1;
    let board_id_for_log = board_id.clone();
    let board_id_for_closure = board_id.clone();
    let commitment = tokio::task::spawn_blocking(move || {
        run_keygen(&state.setup, &state.state, &board_id_for_closure, epoch, request)
    })
    .await
    .map_err(|_| internal_error("dkg worker panicked"))?
    .map_err(map_state_error)?;
    info!(board_id = %board_id_for_log, epoch = commitment.epoch, "created board DKG epoch");
    Ok(Json(KeyGenResponse {
        board_id,
        epoch: commitment.epoch,
        public_key: commitment.public_key,
        commitment: commitment.commitment,
    }))
}

async fn get_commitment(
    State(state): State<Arc<AppState>>,
    Path(board_id): Path<String>,
) -> Result<Json<EpochCommitment>, (StatusCode, Json<Value>)> {
    let commitment = state
        .state
        .lock()
        .await
        .commitment(&board_id)
        .map_err(map_state_error)?
        .ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "BoardNotFound" })),
            )
        })?;
    Ok(Json(commitment))
}

async fn reshare(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(board_id): Path<String>,
    Json(request): Json<ReshareRequest>,
) -> Result<Json<KeyGenResponse>, (StatusCode, Json<Value>)> {
    authorize(&headers, &state.admin_token)?;
    let previous_epoch = state
        .state
        .lock()
        .await
        .commitment(&board_id)
        .map_err(map_state_error)?;
    let epoch = match &previous_epoch {
        Some(commitment) => commitment.epoch + 1,
        None => {
            return Err((
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "BoardNotFound" })),
            ))
        }
    };
    let state_arc = state.clone();
    let board_id_for_log = board_id.clone();
    let board_id_for_closure = board_id.clone();
    let commitment = tokio::task::spawn_blocking(move || {
        run_keygen(&state_arc.setup, &state_arc.state, &board_id_for_closure, epoch, request)
    })
    .await
    .map_err(|_| internal_error("dkg worker panicked"))?
    .map_err(map_state_error)?;
    info!(board_id = %board_id_for_log, epoch = commitment.epoch, "reshared board DKG epoch");
    Ok(Json(KeyGenResponse {
        board_id,
        epoch: commitment.epoch,
        public_key: commitment.public_key,
        commitment: commitment.commitment,
    }))
}

async fn partial_decrypt(
    State(state): State<Arc<AppState>>,
    Path(board_id): Path<String>,
    Json(request): Json<PartialDecryptRequest>,
) -> Result<Json<PartialDecryptResponse>, (StatusCode, Json<Value>)> {
    let loaded = state
        .state
        .lock()
        .await
        .share(&board_id, &request.participant_id)
        .map_err(map_state_error)?;

    let encapsulation = decode_base64(&request.capsule)
        .map_err(|_| bad_request("InvalidCapsule"))?;
    let context = partial_context(&board_id);

    let partial = tokio::task::spawn_blocking(move || {
        let mut rng = ChaCha20Rng::from_entropy();
        crate::dkg::partial_decapsulation(
            &loaded.share,
            &loaded.output,
            &encapsulation,
            &context,
            &mut rng,
        )
    })
    .await
    .map_err(|_| internal_error("partial worker panicked"))?
    .map_err(|_| bad_request("PartialDecryptionFailed"))?;

    let partial_json = serde_json::to_vec(&partial).map_err(|_| internal_error("Serialization"))?;
    Ok(Json(PartialDecryptResponse {
        partial: base64_url(&partial_json),
    }))
}

async fn encapsulate_key(
    State(state): State<Arc<AppState>>,
    Path(board_id): Path<String>,
    Json(request): Json<EncapsulateRequest>,
) -> Result<Json<EncapsulateResponse>, (StatusCode, Json<Value>)> {
    let output = state
        .state
        .lock()
        .await
        .output(&board_id)
        .map_err(map_state_error)?
        .ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "BoardNotFound" })),
            )
        })?;
    let public_key = output.public().public().clone();

    let content_key = decode_base64(&request.content_key)
        .map_err(|_| bad_request("InvalidContentKey"))?;
    let content_key: [u8; crate::kem::CONTENT_KEY_SIZE] = content_key
        .try_into()
        .map_err(|_| bad_request("InvalidContentKeyLength"))?;

    let context = match request.context {
        Some(context) => decode_base64(&context).map_err(|_| bad_request("InvalidContext"))?,
        None => partial_context(&board_id),
    };

    let board_id_for_log = board_id.clone();
    let capsule = tokio::task::spawn_blocking(move || {
        let mut rng = ChaCha20Rng::from_entropy();
        encapsulate(&public_key, &content_key, &context, &mut rng)
    })
    .await
    .map_err(|_| internal_error("encapsulate worker panicked"))?
    .map_err(|_| bad_request("EncapsulationFailed"))?;

    info!(board_id = %board_id_for_log, "encapsulated content key");
    Ok(Json(EncapsulateResponse {
        encapsulation: base64_url(&capsule.encapsulation),
        nonce: base64_url(&capsule.nonce),
        ciphertext: base64_url(&capsule.ciphertext),
        key_commitment: base64_url(&capsule.key_commitment),
    }))
}

async fn decrypt_key(
    State(state): State<Arc<AppState>>,
    Path(board_id): Path<String>,
    Json(request): Json<DecryptRequest>,
) -> Result<Json<DecryptResponse>, (StatusCode, Json<Value>)> {
    let commitment = state
        .state
        .lock()
        .await
        .commitment(&board_id)
        .map_err(map_state_error)?
        .ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "BoardNotFound" })),
            )
        })?;
    let threshold = commitment.threshold as usize;

    let encapsulation = decode_base64(&request.encapsulation)
        .map_err(|_| bad_request("InvalidEncapsulation"))?;
    let nonce: [u8; 12] = decode_base64(&request.nonce)
        .map_err(|_| bad_request("InvalidNonce"))?
        .try_into()
        .map_err(|_| bad_request("InvalidNonceLength"))?;
    let ciphertext = decode_base64(&request.ciphertext)
        .map_err(|_| bad_request("InvalidCiphertext"))?;
    let key_commitment: [u8; 32] = decode_base64(&request.key_commitment)
        .map_err(|_| bad_request("InvalidKeyCommitment"))?
        .try_into()
        .map_err(|_| bad_request("InvalidKeyCommitmentLength"))?;
    let capsule = KeyCapsule {
        encapsulation,
        nonce,
        ciphertext,
        key_commitment,
    };

    let context = match request.context {
        Some(context) => decode_base64(&context).map_err(|_| bad_request("InvalidContext"))?,
        None => partial_context(&board_id),
    };

    let mut shares = Vec::with_capacity(request.participant_ids.len());
    for participant_id in &request.participant_ids {
        let loaded = state
            .state
            .lock()
            .await
            .share(&board_id, participant_id)
            .map_err(map_state_error)?;
        shares.push(loaded);
    }

    let board_id_for_log = board_id.clone();
    let content_key = tokio::task::spawn_blocking(move || {
        let mut rng = ChaCha20Rng::from_entropy();
        let partials: Vec<_> = shares
            .iter()
            .map(|loaded| {
                crate::dkg::partial_decapsulation(
                    &loaded.share,
                    &loaded.output,
                    &capsule.encapsulation,
                    &context,
                    &mut rng,
                )
            })
            .collect::<Result<Vec<_>, _>>()
            .map_err(|_| bad_request("PartialDecryptionFailed"))?;
        decapsulate(&capsule, &context, &partials, threshold)
            .map_err(|_| bad_request("DecapsulationFailed"))
    })
    .await
    .map_err(|_| internal_error("decrypt worker panicked"))?
    .map_err(|e| e)?;

    info!(board_id = %board_id_for_log, "decrypted content key");
    Ok(Json(DecryptResponse {
        content_key: base64_url(&content_key),
    }))
}

fn run_keygen(
    setup: &GoldenSetup,
    state: &Mutex<DkgState>,
    board_id: &str,
    epoch: u64,
    request: impl IntoKeyGenRequest,
) -> Result<EpochCommitment, StateError> {
    let (participants, threshold) = request.into_parts();

    let mut rng = ChaCha20Rng::from_entropy();
    let result = run_dkg(setup, epoch, &participants, threshold, None, &mut rng)
        .map_err(|e| StateError::InvalidMaterial(e.to_string()))?;

    let guard = state.blocking_lock();
    guard.save_epoch(board_id, epoch, threshold, participants, &result)
}

fn partial_context(board_id: &str) -> Vec<u8> {
    format!("app.creaton.forum.dkg-service.partial.v1:{}", board_id).into_bytes()
}

trait IntoKeyGenRequest {
    fn into_parts(self) -> (Vec<ParticipantSpec>, u32);
}

impl IntoKeyGenRequest for KeyGenRequest {
    fn into_parts(self) -> (Vec<ParticipantSpec>, u32) {
        (self.participants, self.threshold)
    }
}

impl IntoKeyGenRequest for ReshareRequest {
    fn into_parts(self) -> (Vec<ParticipantSpec>, u32) {
        (self.participants, self.threshold)
    }
}

fn authorize(headers: &HeaderMap, expected: &str) -> Result<(), (StatusCode, Json<Value>)> {
    let actual = headers
        .get("authorization")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "));
    if actual != Some(expected) {
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(json!({ "error": "Unauthorized" })),
        ));
    }
    Ok(())
}

fn bad_request(message: &str) -> (StatusCode, Json<Value>) {
    (StatusCode::BAD_REQUEST, Json(json!({ "error": message })))
}

fn internal_error(message: &str) -> (StatusCode, Json<Value>) {
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(json!({ "error": message })),
    )
}

fn map_state_error(error: StateError) -> (StatusCode, Json<Value>) {
    match error {
        StateError::BoardNotFound => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "BoardNotFound" })),
        ),
        StateError::ParticipantNotFound => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "ParticipantNotFound" })),
        ),
        StateError::Decryption => (
            StatusCode::UNAUTHORIZED,
            Json(json!({ "error": "DecryptionFailed" })),
        ),
        _ => internal_error(&error.to_string()),
    }
}

fn decode_base64(value: &str) -> Result<Vec<u8>, base64::DecodeError> {
    URL_SAFE_NO_PAD.decode(value)
}

fn base64_url(bytes: &[u8]) -> String {
    URL_SAFE_NO_PAD.encode(bytes)
}
