use std::fmt::Display;

use eyre::{eyre, Ok, WrapErr};

pub struct Health {
    env: HealthEnvironment,
}

impl Display for Health {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        writeln!(f, "Environment:")?;
        writeln!(f, "{}", self.env)
    }
}

pub struct HealthEnvironment {
    pub hbt_root: Option<String>,
    pub hbt_docker_root: Option<String>,
    pub path: Option<String>,
}

impl Display for HealthEnvironment {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        writeln!(
            f,
            "- HBT_ROOT: {}",
            self.hbt_root.as_deref().unwrap_or("Not set")
        )?;

        writeln!(
            f,
            "- HBT_DOCKER_ROOT: {}",
            self.hbt_docker_root.as_deref().unwrap_or("Not set")
        )?;

        writeln!(f, "- PATH: {}", self.path.as_deref().unwrap_or("Not set"))
    }
}

pub async fn check_health() -> eyre::Result<Health> {
    let env = HealthEnvironment {
        hbt_root: std::env::var("HBT_ROOT").ok(),
        hbt_docker_root: std::env::var("HBT_DOCKER_ROOT").ok(),
        path: check_hbt_in_path().await?,
    };

    Ok(Health { env })
}

async fn check_hbt_in_path() -> eyre::Result<Option<String>> {
    let result = tokio::process::Command::new("which")
        .arg("hbt")
        .output()
        .await
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to check if `hbt` is in the PATH")?;

    if result.status.success() {
        let path = String::from_utf8(result.stdout)
            .map_err(|e| eyre!(e))
            .wrap_err("Failed to parse `which` output")?;

        Ok(Some(path))
    } else {
        Ok(None)
    }
}
