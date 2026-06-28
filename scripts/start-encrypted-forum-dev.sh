#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APPLICATIONS_DIR="$(cd "$ROOT_DIR/.." && pwd)"
LOGOS_STORAGE_LIBS_DIR="${LOGOS_STORAGE_LIBS_DIR:-$ROOT_DIR/.dev/logos-storage/v0.3.0-linux-amd64}"
CREATON_SC_DIR="${CREATON_SC_DIR:-$APPLICATIONS_DIR/creaton-sc}"
CREATON_KMS_DIR="${CREATON_KMS_DIR:-$APPLICATIONS_DIR/creaton-kms}"
CREATONPROTO_DIR="${CREATONPROTO_DIR:-$APPLICATIONS_DIR/creatonproto}"
DEV_DIR="${FORUM_DEV_DIR:-$ROOT_DIR/.dev/encrypted-forum}"
ARTIFACT_DIR="$DEV_DIR/artifacts"
LOG_DIR="$DEV_DIR/logs"
RUN_DIR="$DEV_DIR/run"
HELPER_DIR="$DEV_DIR/kms-helper"

RPC_URL="${RPC_URL:-http://127.0.0.1:8545}"
ANVIL_PORT="${ANVIL_PORT:-8545}"
DEPLOYER_PK="${PRIVATE_KEY:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}"
ADMIN_TOKEN="${CREATON_KMS_ADMIN_TOKEN:-dev-kms-admin}"
KMS_API_BASE_PORT="${KMS_API_BASE_PORT:-3020}"
KMS_P2P_BASE_PORT="${KMS_P2P_BASE_PORT:-3030}"
FORUM_APPVIEW_PORT="${FORUM_APPVIEW_PORT:-3010}"
FORUM_DATABASE_URL="${FORUM_DATABASE_URL:-sqlite://$DEV_DIR/forum-appview.db}"
STATE_KEY="${CREATON_KMS_STATE_KEY:-000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f}"
RESET=0
START_APPVIEW=0
START_FRONTEND=0
START_DKG=0
START_STORAGE=0
SKIP_CONTRACTS=0
CHECK_ONLY=0
VERBOSE=0
FOLLOW_LOGS=0

usage() {
  cat <<'EOF'
Usage: scripts/start-encrypted-forum-dev.sh [options]

Bootstraps the local encrypted-forum stack:
  1. starts Anvil (local EVM RPC for KMS contracts and PathUSD mocks)
  2. deploys mock CREATE/PathUSD and KMS contracts to that RPC
  3. generates 15 Commonware Golden/P2P operator identities
  4. registers and attests 15 CREATE-backed operators on the local EVM
  5. starts 15 creaton-kms HTTP/P2P operators (CREATON_KMS_ABSTRACT_RPC_URL points at Anvil)
  6. runs Golden DKG deal/finalize and approves the committee epoch on-chain
  7. writes AppView and creaton-forum env files
  8. optionally starts dkg-service (dev crypto) and forum-storage sidecar

Options:
  --reset           remove .dev/encrypted-forum before bootstrapping
  --start-appview   start creatonproto forum-appview after KMS is ready
  --start-frontend  start creaton-forum with generated env
  --start-dkg       start local dkg-service for VITE_FORUM_CRYPTO_MODE=dev
  --start-storage   start forum-storage sidecar for Logos attachments
  --skip-contracts  reuse existing .dev/encrypted-forum/kms.env
  --check           validate local prerequisites and exit
  --verbose         stream forge/cargo output to the terminal (also saved to logs/)
  --follow-logs     after bootstrap, tail service logs until Ctrl+C
  -h, --help        show this help

Important:
  --start-appview requires FORUM_SERVICE_DID to be set to a DID your local PDS
  can issue service-auth tokens for.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --reset) RESET=1 ;;
    --start-appview) START_APPVIEW=1 ;;
    --start-frontend) START_FRONTEND=1 ;;
    --start-dkg) START_DKG=1 ;;
    --start-storage) START_STORAGE=1 ;;
    --skip-contracts) SKIP_CONTRACTS=1 ;;
    --check) CHECK_ONLY=1 ;;
    --verbose) VERBOSE=1 ;;
    --follow-logs) FOLLOW_LOGS=1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

need cargo
need cast
need curl
need forge
need jq
need node
need rustup

KMS_RUST_TOOLCHAIN="1.91.0"
if [ -f "$CREATON_KMS_DIR/rust-toolchain.toml" ]; then
  KMS_RUST_TOOLCHAIN="$(grep -E '^channel\s*=' "$CREATON_KMS_DIR/rust-toolchain.toml" | sed -E 's/.*=\s*"([^"]+)".*/\1/' | head -n1)"
fi
KMS_RUST_TOOLCHAIN="${KMS_RUST_TOOLCHAIN:-1.91.0}"

ensure_rust_toolchain() {
  if ! rustup toolchain list | grep -q "$KMS_RUST_TOOLCHAIN"; then
    echo "Missing Rust toolchain $KMS_RUST_TOOLCHAIN (required by creaton-kms)." >&2
    echo "Install it with: rustup install $KMS_RUST_TOOLCHAIN" >&2
    exit 1
  fi
}

cargo_kms() {
  RUSTUP_TOOLCHAIN="$KMS_RUST_TOOLCHAIN" cargo "$@"
}

# Run a command, always saving output to log_file. With --verbose, also print to terminal.
run_logged() {
  local log_file="$1"
  shift
  if [ "$VERBOSE" -eq 1 ]; then
    "$@" 2>&1 | tee "$log_file"
  else
    echo "      → logging to $log_file (use --verbose to stream here)"
    "$@" >"$log_file" 2>&1
  fi
}

follow_stack_logs() {
  local files=()
  [ -f "$LOG_DIR/anvil.log" ] && files+=("$LOG_DIR/anvil.log")
  for f in "$LOG_DIR"/kms-*.log; do
    [ -f "$f" ] && files+=("$f")
  done
  [ -f "$LOG_DIR/forum-appview.log" ] && files+=("$LOG_DIR/forum-appview.log")
  [ -f "$LOG_DIR/creaton-forum.log" ] && files+=("$LOG_DIR/creaton-forum.log")
  [ -f "$LOG_DIR/dkg-service.log" ] && files+=("$LOG_DIR/dkg-service.log")
  [ -f "$LOG_DIR/forum-storage.log" ] && files+=("$LOG_DIR/forum-storage.log")
  if [ "${#files[@]}" -eq 0 ]; then
    echo "No log files to follow yet." >&2
    return 1
  fi
  echo ""
  echo "== following stack logs (Ctrl+C stops tail only; services keep running) =="
  tail -n 30 -F "${files[@]}"
}

export_storage_bindings_env() {
  if [ -n "${STORAGE_BINDINGS_LOCAL_LIBS:-}" ]; then
    return
  fi
  if [ -f "$LOGOS_STORAGE_LIBS_DIR/libstorage.h" ] && compgen -G "$LOGOS_STORAGE_LIBS_DIR"/*.a >/dev/null; then
    export STORAGE_BINDINGS_LOCAL_LIBS="$LOGOS_STORAGE_LIBS_DIR"
  fi
}

require_storage_bindings() {
  export_storage_bindings_env
  if [ -n "${STORAGE_BINDINGS_LOCAL_LIBS:-}" ]; then
    return
  fi
  cat >&2 <<EOF
forum-storage requires libstorage v0.3.0, but that GitHub release is not published yet.

Build the native libraries locally first:

  bash scripts/build-logos-storage-libs.sh

Then re-run this bootstrap command.
EOF
  exit 1
}

if [ ! -d "$CREATON_SC_DIR" ]; then
  echo "creaton-sc repo not found: $CREATON_SC_DIR" >&2
  exit 1
fi
if [ ! -d "$CREATON_KMS_DIR" ]; then
  echo "creaton-kms repo not found: $CREATON_KMS_DIR" >&2
  exit 1
fi
if [ ! -d "$CREATONPROTO_DIR/packages/forum-appview" ]; then
  echo "creatonproto forum-appview not found: $CREATONPROTO_DIR/packages/forum-appview" >&2
  exit 1
fi

ensure_rust_toolchain

if [ "$CHECK_ONLY" -eq 1 ]; then
  echo "[✓] encrypted forum dev prerequisites found"
  echo "creaton-sc: $CREATON_SC_DIR"
  echo "creaton-kms: $CREATON_KMS_DIR"
  echo "creatonproto: $CREATONPROTO_DIR"
  echo "rust toolchain: $KMS_RUST_TOOLCHAIN"
  exit 0
fi

# Tail existing logs without re-bootstrapping.
if [ "$FOLLOW_LOGS" -eq 1 ] && [ "$RESET" -eq 0 ] && [ "$START_APPVIEW" -eq 0 ] \
  && [ "$START_FRONTEND" -eq 0 ] && [ "$START_DKG" -eq 0 ] && [ "$START_STORAGE" -eq 0 ] \
  && [ "$SKIP_CONTRACTS" -eq 0 ] && [ -d "$LOG_DIR" ]; then
  follow_stack_logs
  exit 0
fi

if [ "$RESET" -eq 1 ]; then
  rm -rf "$DEV_DIR"
fi
mkdir -p "$ARTIFACT_DIR" "$LOG_DIR" "$RUN_DIR"

echo "== encrypted forum dev bootstrap =="
echo "dev dir: $DEV_DIR"
echo "note: Commonware Golden DKG is threshold crypto + operator P2P, not an L2 chain."
echo "      The EVM chain here is local Anvil (committee registry and PathUSD mocks)."

anvil_ready() {
  curl --max-time 2 -sf "$RPC_URL" \
    -H 'content-type: application/json' \
    -d '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}' >/dev/null
}

if anvil_ready; then
  echo "[✓] Anvil reachable at $RPC_URL"
else
  need anvil
  echo "[·] Starting Anvil on port $ANVIL_PORT"
  anvil --port "$ANVIL_PORT" >"$LOG_DIR/anvil.log" 2>&1 &
  echo "$!" > "$RUN_DIR/anvil.pid"
  for _ in $(seq 1 20); do
    if anvil_ready; then break; fi
    sleep 1
  done
  anvil_ready || { echo "Anvil did not become ready; see $LOG_DIR/anvil.log" >&2; exit 1; }
  echo "[✓] Anvil started"
fi

write_helper() {
  mkdir -p "$HELPER_DIR/src"
  cat > "$HELPER_DIR/rust-toolchain.toml" <<EOF
[toolchain]
channel = "$KMS_RUST_TOOLCHAIN"
EOF
  cat > "$HELPER_DIR/Cargo.toml" <<EOF
[package]
name = "red-dwarf-creaton-kms-dev-helper"
version = "0.1.0"
edition = "2021"

[dependencies]
base64 = "0.22"
commonware-codec = "2026.5.0"
commonware-cryptography = "2026.5.0"
creaton-kms = { path = "$CREATON_KMS_DIR" }
rand_chacha = "0.3"
rand_core = "0.6"
serde_json = "1"
EOF
  cat > "$HELPER_DIR/src/main.rs" <<'EOF'
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use commonware_codec::Encode;
use commonware_cryptography::Signer;
use rand_chacha::{rand_core::SeedableRng, ChaCha20Rng};
use std::{fs, path::PathBuf};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let out = PathBuf::from(std::env::args().nth(1).expect("missing output dir"));
    fs::create_dir_all(&out)?;
    let mut rows = Vec::new();
    for index in 1..=15u64 {
        let dir = out.join(format!("operator-{index:02}"));
        fs::create_dir_all(&dir)?;

        let mut golden_rng = ChaCha20Rng::seed_from_u64(10_000 + index);
        let golden = creaton_kms::golden::generate_identity(&mut golden_rng);
        let golden_private = creaton_kms::golden::encode_identity(&golden);
        let golden_public = creaton_kms::golden::encode_public_key(&golden.public());
        fs::write(dir.join("golden.key"), golden_private)?;

        let mut p2p_rng = ChaCha20Rng::seed_from_u64(20_000 + index);
        let p2p_private = creaton_kms::peer::generate_identity(&mut p2p_rng);
        let p2p_public = creaton_kms::peer::public_identity(&p2p_private)?;
        fs::write(dir.join("p2p.key"), p2p_private)?;

        rows.push(serde_json::json!({
            "index": index,
            "goldenPublicKey": URL_SAFE_NO_PAD.encode(golden_public),
            "p2pPublicKey": p2p_public
        }));
    }
    println!("{}", serde_json::to_string_pretty(&rows)?);
    Ok(())
}
EOF
}

if [ ! -f "$ARTIFACT_DIR/operator-keys.json" ]; then
  echo "[·] Generating Commonware Golden/P2P operator identities"
  write_helper
  cargo_kms run --quiet --manifest-path "$HELPER_DIR/Cargo.toml" -- "$ARTIFACT_DIR" > "$ARTIFACT_DIR/operator-keys.json"
  echo "[✓] Operator identities generated"
else
  echo "[✓] Reusing operator identities"
fi

if [ ! -f "$ARTIFACT_DIR/golden-15.setup" ]; then
  echo "[·] Generating Commonware Golden public setup; this can take a while"
  cargo_kms run --release --manifest-path "$CREATON_KMS_DIR/Cargo.toml" -- \
    --generate-golden-setup "$ARTIFACT_DIR/golden-15.setup"
  echo "[✓] Golden setup generated"
else
  echo "[✓] Reusing Golden setup"
fi

operator_pk() {
  local index="$1"
  printf '0x%064x' $((0x1000 + index))
}

hash_utf8() {
  node --input-type=module -e "import { keccak256, stringToHex } from 'viem'; console.log(keccak256(stringToHex(process.argv[1])))" "$1"
}

hash_b64url() {
  node --input-type=module -e "import { keccak256 } from 'viem'; const s=process.argv[1].replace(/-/g,'+').replace(/_/g,'/'); const b=Buffer.from(s,'base64'); console.log(keccak256('0x'+b.toString('hex')))" "$1"
}

deploy_mock_token_contracts() {
  if [ -f "$CREATON_SC_DIR/.env.deploy" ]; then
    # shellcheck disable=SC1090
    source "$CREATON_SC_DIR/.env.deploy"
    if [ -n "${MOCK_CREATE_ADDRESS:-}" ] && [ -n "${MOCK_USDC_ADDRESS:-}" ]; then
      if cast code "$MOCK_CREATE_ADDRESS" --rpc-url "$RPC_URL" | grep -qv '^0x$'; then
        echo "[✓] Reusing creaton-sc mock CREATE/USDC contracts from .env.deploy"
        return
      fi
    fi
  fi
  echo "[·] Deploying mock CREATE/PathUSD token contracts to local Anvil"
  echo "      (first forge compile can take several minutes)"
  run_logged "$LOG_DIR/deploy-mock-tokens.log" \
    bash -c "cd \"$CREATON_SC_DIR\" && forge script script/Deploy.s.sol:Deploy \
      --rpc-url \"$RPC_URL\" --broadcast --slow --private-key \"$DEPLOYER_PK\""
  # shellcheck disable=SC1090
  source "$CREATON_SC_DIR/.env.deploy"
  echo "[✓] Mock CREATE/USDC contracts deployed"
}

deploy_kms_contracts() {
  if [ "$SKIP_CONTRACTS" -eq 1 ] && [ -f "$DEV_DIR/kms.env" ]; then
    echo "[✓] Reusing KMS contract env"
    return
  fi
  if [ -f "$DEV_DIR/kms.env" ]; then
    # shellcheck disable=SC1090
    source "$DEV_DIR/kms.env"
    if [ -n "${FORUM_COMMITTEE_REGISTRY:-}" ] && cast code "$FORUM_COMMITTEE_REGISTRY" --rpc-url "$RPC_URL" | grep -qv '^0x$'; then
      echo "[✓] Reusing deployed KMS contracts"
      return
    fi
  fi

  deploy_mock_token_contracts

  local script_path="$DEV_DIR/DeployKmsLocal.s.sol"
  cat > "$script_path" <<EOF
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script } from "forge-std/src/Script.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { AccessRevenueRouter } from "$CREATON_SC_DIR/src/AccessRevenueRouter.sol";
import { ForumEntitlementRegistry } from "$CREATON_SC_DIR/src/ForumEntitlementRegistry.sol";
import { IKmsOperatorRegistry, KmsCommitteeRegistry } from "$CREATON_SC_DIR/src/KmsCommitteeRegistry.sol";
import { KmsOperatorRegistry } from "$CREATON_SC_DIR/src/KmsOperatorRegistry.sol";
import { IActiveKmsCommittee, KmsRewardVault } from "$CREATON_SC_DIR/src/KmsRewardVault.sol";
import { CreateWavsServiceManager, IWavsCommitteeRegistry } from "$CREATON_SC_DIR/src/CreateWavsServiceManager.sol";
import { DidWalletRegistry } from "$CREATON_SC_DIR/src/DidWalletRegistry.sol";
import { ForumPosterRewardVault, IDidWalletRegistry } from "$CREATON_SC_DIR/src/ForumPosterRewardVault.sol";
import { IWavsServiceManager } from "$CREATON_SC_DIR/src/WavsTypes.sol";

contract DeployKmsLocal is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        IERC20 create = IERC20(vm.envAddress("CREATE_TOKEN"));
        IERC20 paymentToken = IERC20(vm.envAddress("KMS_PAYMENT_TOKEN"));
        address settler = vm.envAddress("KMS_MPP_SETTLER");
        string memory out = vm.envString("KMS_ENV_OUT");

        vm.startBroadcast(deployerKey);
        address deployer = vm.addr(deployerKey);
        KmsOperatorRegistry operators = new KmsOperatorRegistry(create, deployer, deployer);
        KmsCommitteeRegistry committees = new KmsCommitteeRegistry(IKmsOperatorRegistry(address(operators)), deployer);
        operators.setCommitteeRegistry(address(committees));
        CreateWavsServiceManager serviceManager = new CreateWavsServiceManager(IWavsCommitteeRegistry(address(committees)));
        DidWalletRegistry didWallets = new DidWalletRegistry(IWavsServiceManager(address(serviceManager)));
        ForumPosterRewardVault posterRewards = new ForumPosterRewardVault(
            paymentToken,
            IWavsServiceManager(address(serviceManager)),
            IDidWalletRegistry(address(didWallets)),
            deployer
        );
        KmsRewardVault rewardVault = new KmsRewardVault(paymentToken, IActiveKmsCommittee(address(committees)), deployer);
        AccessRevenueRouter revenueRouter = new AccessRevenueRouter(paymentToken, deployer, address(posterRewards), address(rewardVault));
        ForumEntitlementRegistry entitlements = new ForumEntitlementRegistry(deployer);
        rewardVault.setRevenueRouter(address(revenueRouter));
        posterRewards.setRevenueRouter(address(revenueRouter));
        revenueRouter.setSettler(settler, true);
        entitlements.setIssuer(address(revenueRouter), true);
        vm.stopBroadcast();

        vm.writeFile(out, string.concat(
            "FORUM_OPERATOR_REGISTRY=", vm.toString(address(operators)), "\\n",
            "FORUM_COMMITTEE_REGISTRY=", vm.toString(address(committees)), "\\n",
            "FORUM_SERVICE_MANAGER=", vm.toString(address(serviceManager)), "\\n",
            "FORUM_DID_WALLET_REGISTRY=", vm.toString(address(didWallets)), "\\n",
            "FORUM_POSTER_REWARD_VAULT=", vm.toString(address(posterRewards)), "\\n",
            "FORUM_KMS_REWARD_VAULT=", vm.toString(address(rewardVault)), "\\n",
            "FORUM_REVENUE_ROUTER=", vm.toString(address(revenueRouter)), "\\n",
            "FORUM_ENTITLEMENT_REGISTRY=", vm.toString(address(entitlements)), "\\n"
        ));
    }
}
EOF

  echo "[·] Deploying paid-forum KMS contracts"
  echo "      (compiles creaton-sc + KMS registry contracts; can take several minutes)"
  run_logged "$LOG_DIR/deploy-kms.log" \
    bash -c "cd \"$CREATON_SC_DIR\" && env \
      PRIVATE_KEY=\"$DEPLOYER_PK\" \
      CREATE_TOKEN=\"$MOCK_CREATE_ADDRESS\" \
      KMS_PAYMENT_TOKEN=\"$MOCK_USDC_ADDRESS\" \
      KMS_MPP_SETTLER=\"$(cast wallet address --private-key "$DEPLOYER_PK")\" \
      KMS_ENV_OUT=\"$DEV_DIR/kms.env\" \
      forge script \"$script_path:DeployKmsLocal\" \
        --rpc-url \"$RPC_URL\" --broadcast --slow --private-key \"$DEPLOYER_PK\""
  echo "[✓] KMS contracts deployed"
}

deploy_kms_contracts
# shellcheck disable=SC1090
source "$CREATON_SC_DIR/.env.deploy"
# shellcheck disable=SC1090
source "$DEV_DIR/kms.env"

build_peer_manifest() {
  local tmp="$ARTIFACT_DIR/peers.tmp.json"
  echo '[]' > "$tmp"
  for index in $(seq 1 15); do
    local pk addr p2p_pub golden_pub api p2p
    pk="$(operator_pk "$index")"
    addr="$(cast wallet address --private-key "$pk")"
    p2p_pub="$(jq -r ".[] | select(.index == $index) | .p2pPublicKey" "$ARTIFACT_DIR/operator-keys.json")"
    golden_pub="$(jq -r ".[] | select(.index == $index) | .goldenPublicKey" "$ARTIFACT_DIR/operator-keys.json")"
    api="http://127.0.0.1:$((KMS_API_BASE_PORT + index - 1))"
    p2p="127.0.0.1:$((KMS_P2P_BASE_PORT + index - 1))"
    tmp_next="$tmp.next"
    jq --arg operator "$addr" --arg publicKey "$p2p_pub" --arg goldenPublicKey "$golden_pub" \
      --arg address "$p2p" --arg apiEndpoint "$api" \
      '. + [{operator:$operator, publicKey:$publicKey, goldenPublicKey:$goldenPublicKey, address:$address, apiEndpoint:$apiEndpoint}]' \
      "$tmp" > "$tmp_next"
    mv "$tmp_next" "$tmp"
  done
  jq '{epochId:1, peers:.}' "$tmp" > "$ARTIFACT_DIR/peers.json"
  rm -f "$tmp"
}

if [ ! -f "$ARTIFACT_DIR/peers.json" ]; then
  build_peer_manifest
fi

register_operators() {
  if [ -f "$ARTIFACT_DIR/operators.registered" ]; then
    echo "[✓] Operators already registered"
    return
  fi
  echo "[·] Registering and attesting 15 local KMS operators"
  local bond="100000000000000000000000"
  for index in $(seq 1 15); do
    echo "      operator $index/15"
    local pk addr p2p_pub golden_pub api did_hash peer_hash bls_hash endpoint_hash
    pk="$(operator_pk "$index")"
    addr="$(cast wallet address --private-key "$pk")"
    p2p_pub="$(jq -r ".[] | select(.index == $index) | .p2pPublicKey" "$ARTIFACT_DIR/operator-keys.json")"
    golden_pub="$(jq -r ".[] | select(.index == $index) | .goldenPublicKey" "$ARTIFACT_DIR/operator-keys.json")"
    api="http://127.0.0.1:$((KMS_API_BASE_PORT + index - 1))"
    did_hash="$(hash_utf8 "did:example:kms-operator-$index")"
    peer_hash="$(hash_b64url "$p2p_pub")"
    bls_hash="$(hash_b64url "$golden_pub")"
    endpoint_hash="$(hash_utf8 "$api")"

    cast send "$addr" --value 5ether --rpc-url "$RPC_URL" --private-key "$DEPLOYER_PK" >/dev/null
    cast send "$MOCK_CREATE_ADDRESS" 'mint(address,uint256)' "$addr" 200000000000000000000000 \
      --rpc-url "$RPC_URL" --private-key "$DEPLOYER_PK" >/dev/null
    cast send "$MOCK_CREATE_ADDRESS" 'approve(address,uint256)' "$FORUM_OPERATOR_REGISTRY" \
      0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff \
      --rpc-url "$RPC_URL" --private-key "$pk" >/dev/null
    cast send "$FORUM_OPERATOR_REGISTRY" \
      'registerOperator(bytes32,bytes32,bytes32,bytes32,uint16,uint256)' \
      "$did_hash" "$peer_hash" "$bls_hash" "$endpoint_hash" 0 "$bond" \
      --rpc-url "$RPC_URL" --private-key "$pk" >/dev/null
    cast send "$FORUM_OPERATOR_REGISTRY" 'setWavsSigningKey(address)' "$addr" \
      --rpc-url "$RPC_URL" --private-key "$pk" >/dev/null
    cast send "$FORUM_OPERATOR_REGISTRY" 'setAttested(address,bool)' "$addr" true \
      --rpc-url "$RPC_URL" --private-key "$DEPLOYER_PK" >/dev/null
  done
  touch "$ARTIFACT_DIR/operators.registered"
  echo "[✓] Operators registered"
}

register_operators

if [ ! -f "$ARTIFACT_DIR/epoch.started" ]; then
  echo "[·] Starting KMS committee epoch election"
  cast send "$FORUM_COMMITTEE_REGISTRY" 'startEpochElection()' \
    --rpc-url "$RPC_URL" --private-key "$DEPLOYER_PK" >/dev/null
  touch "$ARTIFACT_DIR/epoch.started"
  echo "[✓] Committee epoch selected"
fi

stop_existing_kms() {
  if compgen -G "$RUN_DIR/kms-*.pid" >/dev/null; then
    for pid_file in "$RUN_DIR"/kms-*.pid; do
      [ -f "$pid_file" ] || continue
      local pid
      pid="$(cat "$pid_file")"
      if ps -p "$pid" >/dev/null 2>&1; then
        kill "$pid" >/dev/null 2>&1 || true
      fi
      rm -f "$pid_file"
    done
  fi
}

start_kms_operators() {
  echo "[·] Starting 15 creaton-kms operators"
  stop_existing_kms
  for index in $(seq 1 15); do
    local pk addr api_port p2p_port op_dir
    pk="$(operator_pk "$index")"
    addr="$(cast wallet address --private-key "$pk")"
    api_port=$((KMS_API_BASE_PORT + index - 1))
    p2p_port=$((KMS_P2P_BASE_PORT + index - 1))
    op_dir="$ARTIFACT_DIR/operator-$(printf '%02d' "$index")"
    env \
      CREATON_KMS_OPERATOR_ADDRESS="$addr" \
      CREATON_KMS_ABSTRACT_RPC_URL="$RPC_URL" \
      CREATON_KMS_COMMITTEE_REGISTRY="$FORUM_COMMITTEE_REGISTRY" \
      CREATON_KMS_ENTITLEMENT_REGISTRY="$FORUM_ENTITLEMENT_REGISTRY" \
      CREATON_KMS_LISTEN="127.0.0.1:$api_port" \
      CREATON_KMS_GOLDEN_SETUP="$ARTIFACT_DIR/golden-15.setup" \
      CREATON_KMS_IDENTITY="$op_dir/golden.key" \
      CREATON_KMS_STATE_KEY="$STATE_KEY" \
      CREATON_KMS_ADMIN_TOKEN="$ADMIN_TOKEN" \
      CREATON_KMS_DATA_DIR="$op_dir/data" \
      CREATON_KMS_P2P_IDENTITY="$op_dir/p2p.key" \
      CREATON_KMS_PEER_MANIFEST="$ARTIFACT_DIR/peers.json" \
      CREATON_KMS_P2P_LISTEN="127.0.0.1:$p2p_port" \
      CREATON_KMS_P2P_ALLOW_PRIVATE_IPS=true \
      cargo_kms run --manifest-path "$CREATON_KMS_DIR/Cargo.toml" > "$LOG_DIR/kms-$(printf '%02d' "$index").log" 2>&1 &
    echo "$!" > "$RUN_DIR/kms-$(printf '%02d' "$index").pid"
  done
  for index in $(seq 1 15); do
    local url="http://127.0.0.1:$((KMS_API_BASE_PORT + index - 1))/health"
    echo "      waiting for KMS operator $index/15 ($url)"
    for attempt in $(seq 1 60); do
      if curl -sf "$url" >/dev/null 2>&1; then break; fi
      if [ "$VERBOSE" -eq 1 ] && [ $((attempt % 5)) -eq 0 ]; then
        echo "        still starting… (${attempt}s)"
      fi
      sleep 1
    done
    curl -sf "$url" >/dev/null 2>&1 || {
      echo "KMS operator $index did not become healthy; see $LOG_DIR/kms-$(printf '%02d' "$index").log" >&2
      exit 1
    }
  done
  echo "[✓] KMS operators healthy"
}

start_kms_operators

finalize_dkg() {
  if [ -f "$ARTIFACT_DIR/dkg.finalized" ]; then
    echo "[✓] DKG already finalized"
    return
  fi
  echo "[·] Running Golden DKG deal/finalize"
  local participants participants_json logs_json
  participants_json="$(jq '[.peers[].goldenPublicKey]' "$ARTIFACT_DIR/peers.json")"
  logs_json='[]'
  for index in $(seq 1 15); do
    local endpoint="http://127.0.0.1:$((KMS_API_BASE_PORT + index - 1))"
    local response="$ARTIFACT_DIR/deal-$index.json"
    jq -n --argjson participants "$participants_json" '{epochId:1, participants:$participants}' |
      curl -sf "$endpoint/v1/dkg/deal" \
        -H "authorization: Bearer $ADMIN_TOKEN" \
        -H 'content-type: application/json' \
        --data-binary @- > "$response"
    logs_json="$(jq --arg log "$(jq -r '.dealerLog' "$response")" '. + [$log]' <<<"$logs_json")"
  done
  local commitment_file="$ARTIFACT_DIR/dkg-commitment.json"
  for index in $(seq 1 15); do
    local endpoint="http://127.0.0.1:$((KMS_API_BASE_PORT + index - 1))"
    jq -n --argjson participants "$participants_json" --argjson dealerLogs "$logs_json" \
      '{epochId:1, participants:$participants, dealerLogs:$dealerLogs}' |
      curl -sf "$endpoint/v1/dkg/finalize" \
        -H "authorization: Bearer $ADMIN_TOKEN" \
        -H 'content-type: application/json' \
        --data-binary @- > "$ARTIFACT_DIR/finalize-$index.json"
  done
  cp "$ARTIFACT_DIR/finalize-1.json" "$commitment_file"
  local transcript public_hash
  transcript="$(jq -r '.transcriptHash' "$commitment_file")"
  public_hash="$(jq -r '.publicOutputHash' "$commitment_file")"
  for index in $(seq 1 10); do
    cast send "$FORUM_COMMITTEE_REGISTRY" 'approveDkg(uint64,bytes32,bytes32,bytes32)' \
      1 "$transcript" "$public_hash" "$public_hash" \
      --rpc-url "$RPC_URL" --private-key "$(operator_pk "$index")" >/dev/null
  done
  touch "$ARTIFACT_DIR/dkg.finalized"
  echo "[✓] DKG finalized and committee epoch approved"
}

finalize_dkg

KMS_ENDPOINTS="$(jq -r '[.peers[].apiEndpoint] | join(",")' "$ARTIFACT_DIR/peers.json")"
APPVIEW_ENV="$DEV_DIR/forum-appview.env"
FRONTEND_ENV="$DEV_DIR/creaton-forum.env"
cat > "$APPVIEW_ENV" <<EOF
FORUM_APPVIEW_PORT=$FORUM_APPVIEW_PORT
FORUM_DATABASE_URL=$FORUM_DATABASE_URL
TEMPO_RPC_URL=$RPC_URL
FORUM_SERVICE_DID=${FORUM_SERVICE_DID:-}
FORUM_MPP_SECRET=${FORUM_MPP_SECRET:-dev-forum-mpp-secret-at-least-32-bytes}
FORUM_MPP_SETTLER_PRIVATE_KEY=$DEPLOYER_PK
FORUM_REVENUE_ROUTER=$FORUM_REVENUE_ROUTER
FORUM_KMS_ENDPOINTS=$KMS_ENDPOINTS
FORUM_KMS_BEARER_TOKEN=$ADMIN_TOKEN
FORUM_OPERATOR_REGISTRY=$FORUM_OPERATOR_REGISTRY
FORUM_DID_WALLET_REGISTRY=$FORUM_DID_WALLET_REGISTRY
EOF

cat > "$FRONTEND_ENV" <<EOF
VITE_CREATON_FORUM_APPVIEW_URL=http://localhost:$FORUM_APPVIEW_PORT
VITE_FORUM_CRYPTO_MODE=production
VITE_FORUM_ISSUER_DID=${FORUM_SERVICE_DID:-}
VITE_TEMPO_CHAIN_ID=${VITE_TEMPO_CHAIN_ID:-42429}
VITE_TEMPO_PATHUSD_ADDRESS=${VITE_TEMPO_PATHUSD_ADDRESS:-$MOCK_USDC_ADDRESS}
VITE_TEMPO_BOARD_PAY_TO=${VITE_TEMPO_BOARD_PAY_TO:-$FORUM_POSTER_REWARD_VAULT}
VITE_FORUM_POSTER_REWARD_VAULT=$FORUM_POSTER_REWARD_VAULT
VITE_FORUM_REVENUE_ROUTER=$FORUM_REVENUE_ROUTER
VITE_FORUM_COMMITTEE_REGISTRY=$FORUM_COMMITTEE_REGISTRY
VITE_FORUM_ENTITLEMENT_REGISTRY=$FORUM_ENTITLEMENT_REGISTRY
VITE_FORUM_STORAGE_URL=http://localhost:3022
VITE_DKG_SERVICE_URL=http://localhost:3021
EOF

echo "[✓] Wrote $APPVIEW_ENV"
echo "[✓] Wrote $FRONTEND_ENV"

if [ "$START_APPVIEW" -eq 1 ]; then
  if [ -z "${FORUM_SERVICE_DID:-}" ]; then
    echo "--start-appview requires FORUM_SERVICE_DID. Set it to the local service DID your PDS accepts." >&2
    exit 1
  fi
  echo "[·] Starting forum AppView"
  (
    cd "$CREATONPROTO_DIR"
    set -a
    # shellcheck disable=SC1090
    source "$APPVIEW_ENV"
    set +a
    pnpm --filter @creatonproto/forum-appview dev
  ) > "$LOG_DIR/forum-appview.log" 2>&1 &
  echo "$!" > "$RUN_DIR/forum-appview.pid"
  echo "[✓] Forum AppView starting; logs: $LOG_DIR/forum-appview.log"
fi

if [ "$START_FRONTEND" -eq 1 ]; then
  echo "[·] Starting creaton-forum"
  (
    cd "$ROOT_DIR"
    set -a
    # shellcheck disable=SC1090
    source "$FRONTEND_ENV"
    set +a
    bun dev
  ) > "$LOG_DIR/creaton-forum.log" 2>&1 &
  echo "$!" > "$RUN_DIR/creaton-forum.pid"
  echo "[✓] creaton-forum starting; logs: $LOG_DIR/creaton-forum.log"
fi

if [ "$START_DKG" -eq 1 ]; then
  echo "[·] Starting dkg-service for dev crypto mode"
  (
    cd "$ROOT_DIR"
    bash scripts/dev-dkg-service.sh
  ) > "$LOG_DIR/dkg-service.log" 2>&1 &
  echo "$!" > "$RUN_DIR/dkg-service.pid"
  echo "[✓] dkg-service starting; logs: $LOG_DIR/dkg-service.log"
fi

if [ "$START_STORAGE" -eq 1 ]; then
  require_storage_bindings
  echo "[·] Starting forum-storage sidecar"
  (
    cd "$ROOT_DIR/packages/forum-storage"
    export_storage_bindings_env
    env FORUM_STORAGE_LISTEN=127.0.0.1:3022 \
      cargo_kms run --quiet
  ) > "$LOG_DIR/forum-storage.log" 2>&1 &
  echo "$!" > "$RUN_DIR/forum-storage.pid"
  echo "[✓] forum-storage starting; logs: $LOG_DIR/forum-storage.log"
fi

cat <<EOF

== encrypted forum dev stack ready ==

Running services (logs in $LOG_DIR):
  - Anvil EVM RPC:     $RPC_URL
  - 15 creaton-kms:    ports $KMS_API_BASE_PORT–$((KMS_API_BASE_PORT + 14)) (HTTP), P2P $KMS_P2P_BASE_PORT–$((KMS_P2P_BASE_PORT + 14))
$( [ "$START_APPVIEW" -eq 1 ] && echo "  - forum-appview:     http://localhost:$FORUM_APPVIEW_PORT" )
$( [ "$START_FRONTEND" -eq 1 ] && echo "  - creaton-forum:     http://localhost:8082" )
$( [ "$START_DKG" -eq 1 ] && echo "  - dkg-service:       http://localhost:3021 (dev crypto only)" )
$( [ "$START_STORAGE" -eq 1 ] && echo "  - forum-storage:     http://localhost:3022" )

KMS endpoints:
  $KMS_ENDPOINTS

AppView env:
  set -a; source "$APPVIEW_ENV"; set +a
  cd "$CREATONPROTO_DIR" && pnpm --filter @creatonproto/forum-appview dev

creaton-forum env:
  set -a; source "$FRONTEND_ENV"; set +a
  cd "$ROOT_DIR" && bun dev

Follow logs:
  bash scripts/start-encrypted-forum-dev.sh --follow-logs
  # or: tail -F $LOG_DIR/*.log

Stop services:
  for f in "$RUN_DIR"/*.pid; do [ -f "\$f" ] && kill "\$(cat "\$f")"; done
EOF

if [ "$FOLLOW_LOGS" -eq 1 ]; then
  follow_stack_logs
fi
