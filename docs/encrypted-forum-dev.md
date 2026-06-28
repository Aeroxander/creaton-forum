# Encrypted forum local dev stack

Use this when you need paid encrypted boards with production KMS threshold decrypt, or Logos-backed attachments.

## Prerequisites

The bootstrap script expects these commands on PATH:

- `anvil`, `cast`, `forge` (Foundry)
- `cargo`
- `curl`, `jq`, `node`
- Sibling repos: `creaton-sc`, `creaton-kms`, `creatonproto`

Verify:

```sh
bash scripts/start-encrypted-forum-dev.sh --check
```

## Quick start

Production KMS + forum-appview + creaton-forum (verbose + live logs):

```sh
bash scripts/start-encrypted-forum-dev.sh --reset --verbose --follow-logs \
  --start-appview --start-frontend
```

Production KMS + forum-appview + creaton-forum (quiet bootstrap):

```sh
bash scripts/start-encrypted-forum-dev.sh --reset --start-appview --start-frontend
```

With dev DKG crypto (`VITE_FORUM_CRYPTO_MODE=dev`) and forum-storage sidecar:

```sh
bash scripts/start-encrypted-forum-dev.sh --reset --verbose --follow-logs \
  --start-dkg --start-storage --start-frontend
```

After bootstrap, tail running services without re-deploying:

```sh
bash scripts/start-encrypted-forum-dev.sh --follow-logs
# or: tail -F .dev/encrypted-forum/logs/*.log
```

## What is actually running?

This is **not** a Commonware L2 devnet. The stack has two layers:

| Layer | What runs | Role |
|-------|-----------|------|
| **EVM** | Anvil on `:8545` | Local EVM for PathUSD mocks, committee registry, entitlements |
| **KMS** | 15 × `creaton-kms` | Commonware Golden threshold DKG + HTTP/P2P operators that release key shares |

Commonware here is **cryptography and operator networking**, not the chain itself. Golden DKG is the ceremony that produces the committee's threshold public key; Anvil holds the on-chain registry that records which operators were elected.

The bootstrap script is **one-shot**: it deploys contracts, starts background daemons, writes env files, then exits. Long steps (forge compile, KMS contract deploy, starting 15 Rust binaries) log to `.dev/encrypted-forum/logs/`. Use `--verbose` to stream forge/cargo to your terminal, or `--follow-logs` to tail service output after bootstrap.

First KMS contract deploy can sit silent for several minutes while Forge compiles `creaton-sc` — check `.dev/encrypted-forum/logs/deploy-kms.log` if it looks stuck.

Set a local service DID before starting AppView:

```sh
FORUM_SERVICE_DID=did:web:example.test \
  bash scripts/start-encrypted-forum-dev.sh --reset --start-appview --start-frontend
```

## What the script does

Creates `.dev/encrypted-forum/` and:

1. Starts Anvil (local EVM for PathUSD mocks, committee registry, entitlements)
2. Deploys CREATE/PathUSD mocks and KMS contracts from `../creaton-sc`
3. Generates 15 Commonware operator identities
4. Starts 15 `creaton-kms` operators (local EVM via `CREATON_KMS_ABSTRACT_RPC_URL`) and finalizes Golden DKG
5. Writes:
   - `.dev/encrypted-forum/forum-appview.env`
   - `.dev/encrypted-forum/creaton-forum.env`

Optional services:

| Flag | Service | Port |
|------|---------|------|
| `--start-appview` | `creatonproto/forum-appview` | 3010 |
| `--start-frontend` | `bun dev` (creaton-forum) | 8082 |
| `--start-dkg` | `packages/dkg-service` | 3021 |
| `--start-storage` | `packages/forum-storage` | 3022 |

## Environment variables

Source generated env for the frontend:

```sh
set -a
source .dev/encrypted-forum/creaton-forum.env
set +a
bun dev
```

| Variable | Purpose |
|----------|---------|
| `VITE_CREATON_FORUM_APPVIEW_URL` | forum-appview XRPC |
| `VITE_FORUM_CRYPTO_MODE` | `dev` or `production` |
| `VITE_DKG_SERVICE_URL` | Dev-only local DKG (`dev` mode) |
| `VITE_FORUM_STORAGE_URL` | forum-storage sidecar (Logos upload/fetch) |
| `VITE_TEMPO_CHAIN_ID` | Tempo chain ID (4217 mainnet, 42429 testnet; local Anvil uses 42429 in dev env) |
| `VITE_TEMPO_PATHUSD_ADDRESS` | PathUSD contract |
| `VITE_TEMPO_BOARD_PAY_TO` | Default pay-to address for community protected boards |
| `VITE_FORUM_REVENUE_ROUTER` | Revenue router |
| `VITE_FORUM_COMMITTEE_REGISTRY` | KMS committee registry |
| `VITE_FORUM_ENTITLEMENT_REGISTRY` | Entitlement registry |
| `VITE_FORUM_ISSUER_DID` | AppView issuer DID |

## Logos storage

`forum-storage` wraps [storage-rust-bindings](https://github.com/nipsysdev/storage-rust-bindings) and requires the libstorage v0.3.0 native libraries. That GitHub release tag exists upstream but the prebuilt tarball has not been published yet, so you need to build the libs locally once:

Do not run the build script with `sudo`. Install deps for your user account instead:

```sh
sudo apt install nim cmake
bash scripts/build-logos-storage-libs.sh
export STORAGE_BINDINGS_LOCAL_LIBS=$PWD/.dev/logos-storage/v0.3.0-linux-amd64
cd packages/forum-storage && cargo build
```

Prerequisites: `git`, `python3`, `gcc`, `g++`, `ar`, `cmake`, and `nim`.

Do not set `LOGOS_STORAGE_VERSION=v0.3.0` unless you are using locally built libs; that env var makes `storage-bindings` try to download a missing GitHub release.

Health check: `curl http://localhost:3022/health`

## Stop services

```sh
for f in .dev/encrypted-forum/run/*.pid; do [ -f "$f" ] && kill "$(cat "$f")"; done
```
