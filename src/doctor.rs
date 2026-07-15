use std::fmt::Display;

use eyre::{eyre, Ok, WrapErr};

pub struct Health {
    env: HealthEnvironment,
    docker: HealthDocker,
}

impl Display for Health {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        writeln!(f, "Environment:")?;
        write!(f, "{}", self.env)?;
        writeln!(f, "")?;
        writeln!(f, "Docker:")?;
        write!(f, "{}", self.docker)
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

        write!(f, "- PATH: {}", self.path.as_deref().unwrap_or("Not set"))
    }
}

pub struct HealthDocker {
    pub version: Option<String>,
    pub compose_version: Option<String>,
    pub path: Option<String>,
}

impl Display for HealthDocker {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        writeln!(
            f,
            "- {}",
            self.version.as_deref().unwrap_or("Version: Not available")
        )?;

        writeln!(
            f,
            "- {}",
            self.compose_version
                .as_deref()
                .unwrap_or("Compose Version: Not available")
        )?;

        write!(f, "- PATH: {}", self.path.as_deref().unwrap_or("Not set"))
    }
}

pub async fn check_health() -> eyre::Result<Health> {
    let env = HealthEnvironment {
        hbt_root: std::env::var("HBT_ROOT").ok(),
        hbt_docker_root: std::env::var("HBT_DOCKER_ROOT").ok(),
        path: which("hbt").await?,
    };

    let docker = HealthDocker {
        version: docker_version().await?,
        compose_version: docker_compose_version().await?,
        path: which("docker").await?,
    };

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

async fn which(command: &str) -> eyre::Result<Option<String>> {
    let result = tokio::process::Command::new("which")
        .arg(command)
        .output()
        .await
        .map_err(|e| eyre!(e))
        .wrap_err(format!("Failed to check if `{}` is in the PATH", command))?;

    if result.status.success() {
        let path = String::from_utf8(result.stdout)
            .map_err(|e| eyre!(e))
            .wrap_err("Failed to parse `which` output")?;

        Ok(Some(path))
    } else {
        Ok(None)
    }
}
