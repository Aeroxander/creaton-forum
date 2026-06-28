use std::sync::Arc;

use axum::body::{to_bytes, Body};
use axum::extract::Request;
use axum::http::StatusCode;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use commonware_codec::ReadExt;
use commonware_cryptography::bls12381::primitives::group::G1;
use commonware_utils::NZU32;
use rand_chacha::rand_core::SeedableRng;
use dkg_service::dkg::GoldenSetup;
use dkg_service::server::{router, AppState};
use dkg_service::state::DkgState;
use rand::RngCore;
use tokio::sync::Mutex;
use tower::ServiceExt;

fn base64_url(bytes: &[u8]) -> String {
    URL_SAFE_NO_PAD.encode(bytes)
}

fn decode_base64_url(value: &str) -> Vec<u8> {
    URL_SAFE_NO_PAD.decode(value).unwrap()
}

fn app_state(tmp: &tempfile::TempDir) -> Arc<AppState> {
    let setup = GoldenSetup::generate(NZU32!(8));
    let data_dir = tmp.path().join("data");
    let mut state_key = [0u8; 32];
    rand::rng().fill_bytes(&mut state_key);
    let state = DkgState::new(&data_dir, &hex::encode(state_key)).unwrap();
    Arc::new(AppState {
        setup,
        admin_token: "test-admin-token-12345".into(),
        state: Mutex::new(state),
    })
}

async fn request(
    router: &mut axum::Router,
    method: &str,
    path: &str,
    auth: Option<&str>,
    body: Option<serde_json::Value>,
) -> (StatusCode, serde_json::Value) {
    let mut builder = Request::builder().method(method).uri(path);
    if let Some(token) = auth {
        builder = builder.header("authorization", format!("Bearer {token}"));
    }
    let request = if let Some(body) = body {
        builder
            .header("content-type", "application/json")
            .body(Body::from(serde_json::to_vec(&body).unwrap()))
            .unwrap()
    } else {
        builder.body(Body::empty()).unwrap()
    };
    let response = router.clone().oneshot(request).await.unwrap();
    let status = response.status();
    let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let json: serde_json::Value = serde_json::from_slice(&bytes).unwrap_or_else(|_| {
        serde_json::json!({ "raw": String::from_utf8_lossy(&bytes).to_string() })
    });
    (status, json)
}

#[tokio::test]
async fn e2e_2_of_3_dkg_and_partial_decryption() {
    let tmp = tempfile::tempdir().unwrap();
    let state = app_state(&tmp);
    let mut app = router(state);

    // 1. Health reports ready.
    let (status, body) = request(&mut app, "GET", "/health", None, None).await;
    assert!(status.is_success());
    assert_eq!(body["goldenSetupReady"].as_bool(), Some(true));

    // 2. Create a board DKG epoch.
    let board_id = "test-board-42";
    let participants = serde_json::json!({
        "participants": [
            { "id": "creator", "publicKey": base64_url(b"creator-did-key") },
            { "id": "mod-a", "publicKey": base64_url(b"mod-a-did-key") },
            { "id": "mod-b", "publicKey": base64_url(b"mod-b-did-key") }
        ],
        "threshold": 2
    });
    let (status, commitment) = request(
        &mut app,
        "POST",
        &format!("/v1/boards/{board_id}/key"),
        Some("test-admin-token-12345"),
        Some(participants),
    )
    .await;
    assert!(
        status.is_success(),
        "key-gen failed: {commitment}"
    );
    assert_eq!(commitment["boardId"].as_str(), Some(board_id));
    assert_eq!(commitment["epoch"].as_u64(), Some(1));
    let public_key_b64 = commitment["publicKey"].as_str().unwrap();
    let public_key_bytes = decode_base64_url(public_key_b64);
    let public_key = G1::read(&mut public_key_bytes.as_slice()).unwrap();

    // 3. Verify commitment endpoint.
    let (status, current) = request(
        &mut app,
        "GET",
        &format!("/v1/boards/{board_id}/commitment"),
        None,
        None,
    )
    .await;
    assert!(status.is_success());
    assert_eq!(current["publicKey"].as_str(), Some(public_key_b64));

    // 4. Encapsulate a content key under the board public key.
    let content_key = [42u8; 32];
    let context = format!("app.creaton.forum.dkg-service.partial.v1:{board_id}");
    let mut kem_rng = rand_chacha::ChaCha20Rng::from_seed([7u8; 32]);
    let capsule = dkg_service::kem::encapsulate(
        &public_key,
        &content_key,
        context.as_bytes(),
        &mut kem_rng,
    )
    .unwrap();

    // 5. Request partial decryptions from two participants.
    let mut partials = Vec::new();
    for participant in ["creator", "mod-a"] {
        let request_body = serde_json::json!({
            "participantId": participant,
            "ciphertext": base64_url(&capsule.ciphertext),
            "nonce": base64_url(&capsule.nonce),
            "capsule": base64_url(&capsule.encapsulation),
        });
        let (status, partial_json) = request(
            &mut app,
            "POST",
            &format!("/v1/boards/{board_id}/partial-decrypt"),
            None,
            Some(request_body),
        )
        .await;
        assert!(
            status.is_success(),
            "partial decrypt failed for {participant}: {partial_json}"
        );
        let partial_bytes = decode_base64_url(partial_json["partial"].as_str().unwrap());
        let partial: dkg_service::kem::DecapsulationShare =
            serde_json::from_slice(&partial_bytes).unwrap();
        partials.push(partial);
    }

    // 6. Combine partials and recover the content key.
    let recovered =
        dkg_service::kem::decapsulate(&capsule, context.as_bytes(), &partials, 2).unwrap();
    assert_eq!(recovered, content_key);

    // 7. Reshare and bump the epoch.
    let reshare = serde_json::json!({
        "participants": [
            { "id": "creator", "publicKey": base64_url(b"creator-did-key") },
            { "id": "mod-a", "publicKey": base64_url(b"mod-a-did-key") },
            { "id": "mod-c", "publicKey": base64_url(b"mod-c-did-key") }
        ],
        "threshold": 2
    });
    let (status, reshare_commitment) = request(
        &mut app,
        "POST",
        &format!("/v1/boards/{board_id}/reshare"),
        Some("test-admin-token-12345"),
        Some(reshare),
    )
    .await;
    assert!(status.is_success(), "reshare failed: {reshare_commitment}");
    assert_eq!(reshare_commitment["epoch"].as_u64(), Some(2));
}
