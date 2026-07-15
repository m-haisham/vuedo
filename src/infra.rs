use eyre::{eyre, WrapErr};
use serde::Deserialize;
use std::path::PathBuf;

use crate::env::{get_hbt_docker_root, read_env};

#[derive(Debug, Deserialize)]
pub struct InfraEnv {
    pub mysql_db_password: String,
}

#[tracing::instrument(skip_all)]
pub async fn get_infra_env_path() -> eyre::Result<PathBuf> {
    let hbt_docker_path = get_hbt_docker_root()?;
    let infra_env_path = hbt_docker_path.join("hbt-infra").join(".env");

    if infra_env_path.exists() && infra_env_path.is_file() {
        Ok(infra_env_path)
    } else {
        eyre::bail!("Could not find .env file in hbt-infra directory");
    }
}

#[tracing::instrument(skip_all)]
pub async fn get_infra_env() -> eyre::Result<InfraEnv> {
    let infra_env_path = get_infra_env_path().await?;
    let infra_env = read_env(&infra_env_path)?;
    Ok(infra_env)
}

pub fn set_current_infra() -> eyre::Result<()> {
    tracing::info!("Setting current directory to hbt-infra");

    let hbt_docker_root = get_hbt_docker_root()?;
    let infra_dir = hbt_docker_root.join("hbt-infra");

    std::env::set_current_dir(infra_dir)
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to change directory")?;

    Ok(())
}
