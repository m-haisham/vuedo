use std::fmt::Display;

use eyre::{eyre, WrapErr};

use crate::{
    ui::{components::LabeledLine, traits::Draw},
    utils::which,
};

#[derive(Debug)]
pub struct DockerHealth {
    pub version: eyre::Result<Option<DockerVersion>>,
    pub compose_version: eyre::Result<Option<DockerComposeVersion>>,
    pub path: eyre::Result<Option<String>>,
}

impl DockerHealth {
    pub async fn new() -> Self {
        let version = docker_version().await;
        let compose_version = docker_compose_version().await;
        let path = which("docker").await;

        Self {
            version,
            compose_version,
            path,
        }
    }
}

impl Draw for DockerHealth {
    fn draw_compact(&self, brush: &crate::ui::BrushContext<'_>) -> eyre::Result<()> {
        brush.heading("Docker")?;
        LabeledLine::from_err_option("Version", &self.version).draw(brush)?;
        LabeledLine::from_err_option("Compose Version", &self.compose_version).draw(brush)?;
        LabeledLine::from_err_option("Path", &self.path).draw(brush)?;
        Ok(())
    }

    fn draw_verbose(&self, brush: &crate::ui::BrushContext<'_>) -> eyre::Result<()> {
        self.draw_compact(brush)
    }
}

#[derive(Debug)]
pub struct DockerVersion {
    version: String,
    build: String,
}

impl Display for DockerVersion {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{} ({})", self.version, self.build)
    }
}

#[derive(Debug)]
pub struct DockerComposeVersion {
    version: String,
}

impl Display for DockerComposeVersion {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.version)
    }
}

async fn docker_version() -> eyre::Result<Option<DockerVersion>> {
    let result = tokio::process::Command::new("docker")
        .arg("--version")
        .output()
        .await
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to check Docker version")?;

    if result.status.success() {
        let version_string = String::from_utf8(result.stdout)
            .map_err(|e| eyre!(e))
            .wrap_err("Failed to parse Docker version output")?
            .trim()
            .to_string();

        let version_parts: Vec<&str> = version_string.split_whitespace().collect();
        if version_parts.len() < 5 {
            return Err(eyre!("Failed to parse Docker version output"));
        }

        let version = version_parts[2].trim_end_matches(",").to_string();
        let build = version_parts[4].to_string();

        Ok(Some(DockerVersion { version, build }))
    } else {
        Ok(None)
    }
}

async fn docker_compose_version() -> eyre::Result<Option<DockerComposeVersion>> {
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

        let version_parts: Vec<&str> = version.split_whitespace().collect();

        if version_parts.len() != 4 {
            return Err(eyre!("Failed to parse Docker Compose version output"));
        }

        let version = version_parts[3].to_string();
        Ok(Some(DockerComposeVersion { version }))
    } else {
        Ok(None)
    }
}
