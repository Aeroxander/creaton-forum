use std::{net::SocketAddr, path::{Path, PathBuf}, sync::Arc};

use anyhow::Context;
use clap::Parser;
use dkg_service::{
    dkg::GoldenSetup,
    server::{router, AppState},
    state::DkgState,
};
use tokio::sync::Mutex;
use tracing::info;

#[derive(Debug, Parser)]
#[command(name = "dkg-service")]
struct Config {
    #[arg(long, env = "PORT", default_value = "3000")]
    port: u16,
    #[arg(long, env = "CREATON_KMS_GOLDEN_SETUP")]
    golden_setup: Option<PathBuf>,
    #[arg(long, env = "CREATON_KMS_MAX_PLAYERS", default_value = "8")]
    max_players: u32,
    #[arg(long, env = "CREATON_KMS_DATA_DIR", default_value = "./data")]
    data_dir: PathBuf,
    #[arg(long, env = "CREATON_KMS_STATE_KEY")]
    state_key: String,
    #[arg(long, env = "CREATON_KMS_ADMIN_TOKEN")]
    admin_token: String,
    /// Generate the reusable public Golden setup and exit.
    #[arg(long)]
    generate_golden_setup: Option<PathBuf>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    let config = Config::parse();

    if let Some(path) = &config.generate_golden_setup {
        if path.exists() {
            anyhow::bail!(
                "refusing to overwrite existing Golden setup: {}",
                path.display()
            );
        }
        info!(path = %path.display(), "generating Commonware Golden public setup");
        // Generate a generous setup supporting up to 64 board members.
        let max_players = std::num::NonZeroU32::new(config.max_players)
            .context("max-players must be > 0")?;
        let setup = GoldenSetup::generate(max_players);
        std::fs::create_dir_all(path.parent().unwrap_or(Path::new(".")))?;
        std::fs::write(path, setup.encode())?;
        info!(path = %path.display(), "wrote reusable Commonware Golden public setup");
        return Ok(());
    }

    let golden_setup = config.golden_setup.context("--golden-setup / CREATON_KMS_GOLDEN_SETUP is required")?;
    let setup_bytes = std::fs::read(&golden_setup)
        .with_context(|| format!("reading {}", golden_setup.display()))?;
    let max_players = std::num::NonZeroU32::new(config.max_players)
        .context("max-players must be > 0")?;
    let setup = GoldenSetup::decode(&setup_bytes, max_players)
        .context("invalid Golden setup file")?;

    let dkg_state = DkgState::new(&config.data_dir, &config.state_key)
        .context("failed to initialize encrypted state")?;

    let app_state = Arc::new(AppState {
        setup,
        admin_token: config.admin_token,
        state: Mutex::new(dkg_state),
    });

    let app = router(app_state);
    let addr = SocketAddr::from(([0, 0, 0, 0], config.port));
    let listener = tokio::net::TcpListener::bind(addr).await?;
    info!(addr = %addr, "DKG service listening");
    axum::serve(listener, app)
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await?;
    Ok(())
}
