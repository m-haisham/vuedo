use eyre::{eyre, Ok, WrapErr};

use crate::utils::which;

#[allow(dead_code)] // We expect this to be used in the future
pub struct Health {
    env: HealthEnvironment,
    docker: HealthDocker,
}

pub struct HealthEnvironment {
    pub hbt_root: Option<String>,
    pub hbt_docker_root: Option<String>,
    pub path: Option<String>,
}

impl HealthEnvironment {
    pub fn draw(&self) {
        println!("Environment:");

        println!(
            "- HBT_ROOT: {}",
            self.hbt_root.as_deref().unwrap_or("Not set")
        );
        println!(
            "- HBT_DOCKER_ROOT: {}",
            self.hbt_docker_root.as_deref().unwrap_or("Not set")
        );
        println!("- PATH: {}", self.path.as_deref().unwrap_or("Not set"));
    }
}

pub struct HealthDocker {
    pub version: Option<String>,
    pub compose_version: Option<String>,
    pub path: Option<String>,
}

impl HealthDocker {
    pub fn draw(&self) {
        println!("Docker:");

        println!(
            "- {}",
            self.version.as_deref().unwrap_or("Version: Not available")
        );
        println!(
            "- {}",
            self.compose_version
                .as_deref()
                .unwrap_or("Compose Version: Not available")
        );
        println!("- PATH: {}", self.path.as_deref().unwrap_or("Not set"));
    }
}

pub async fn check_health() -> eyre::Result<Health> {
    let env = HealthEnvironment {
        hbt_root: std::env::var("HBT_ROOT").ok(),
        hbt_docker_root: std::env::var("HBT_DOCKER_ROOT").ok(),
        path: which("hbt").await?,
    };

    env.draw();

    let docker = HealthDocker {
        version: docker_version().await?,
        compose_version: docker_compose_version().await?,
        path: which("docker").await?,
    };

    docker.draw();

    Ok(Health { env, docker })
}

async fn docker_version() -> eyre::Result<Option<String>> {
    let result = tokio::process::Command::new("docker")
        .arg("--version")
        .output()
        .await
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to check Docker version")?;

    if result.status.success() {
        let version = String::from_utf8(result.stdout)
            .map_err(|e| eyre!(e))
            .wrap_err("Failed to parse Docker version output")?
            .trim()
            .to_string();

        Ok(Some(version))
    } else {
        Ok(None)
    }
}

async fn docker_compose_version() -> eyre::Result<Option<String>> {
    let result = tokio::process::Command::new("docker-compose")
        .arg("--version")
        .output()
        .await
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to check Docker Compose version")?;

    if result.status.success() {
        let version = String::from_utf8(result.stdout)
            .map_err(|e| eyre!(e))
            .wrap_err("Failed to parse Docker Compose version output")?
            .trim()
            .to_string();

        Ok(Some(version))
    } else {
        Ok(None)
    }
}
