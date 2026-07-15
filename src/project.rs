use eyre::{eyre, WrapErr};
use serde::Deserialize;
use std::env::set_current_dir;
use strum::EnumIter;

use crate::env::{get_hbt_docker_root, get_hbt_root};

#[derive(Debug, Hash, Clone, EnumIter, PartialEq, Eq)]
pub enum Project {
    Traefik,
    Infra,
    Gateway,
    Rates,
    Search,
    Operations,
    Foundation,
    Products,
    ApiGateway,
    App,
    Nest,
}

impl Project {
    pub fn name(&self) -> &str {
        match self {
            Project::Traefik => "traefik",
            Project::Infra => "infra",
            Project::Gateway => "gateway",
            Project::Rates => "rates",
            Project::Search => "search",
            Project::Operations => "operations",
            Project::Foundation => "foundation",
            Project::Products => "products",
            Project::ApiGateway => "apigateway",
            Project::App => "app",
            Project::Nest => "nest",
        }
    }

    pub fn dir_name(&self) -> Option<&str> {
        match self {
            Project::Traefik => None,
            Project::Infra => None,
            Project::Gateway => Some("gateway-app"),
            Project::Rates => Some("rates"),
            Project::Search => Some("search"),
            Project::Operations => Some("operations"),
            Project::Foundation => Some("foundation"),
            Project::Products => Some("products"),
            Project::ApiGateway => Some("apigateway"),
            Project::App => Some("hummingbird-app"),
            Project::Nest => Some("nest-app"),
        }
    }
}

pub async fn set_current_project(project: &Project) -> eyre::Result<()> {
    tracing::info!("Setting current directory to {}", project.name());

    let hbt_docker_root = get_hbt_docker_root()?;
    let project_dir = hbt_docker_root.join(format!("hbt-{}", project.name()));

    set_current_dir(project_dir)
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to change directory")?;

    Ok(())
}

#[tracing::instrument]
pub fn detect_project() -> eyre::Result<Option<Project>> {
    let current_dir = std::env::current_dir()
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to get current directory")?;

    let mut current_dir = Some(current_dir);

    while let Some(dir) = current_dir {
        tracing::info!("Checking directory for project: {}", dir.display());

        let Some(dir_name) = dir.file_name() else {
            tracing::warn!("Directory does not have a valid name: {}", dir.display());
            break;
        };

        let Some(dir_name) = dir_name.to_str() else {
            tracing::warn!("Directory name is not valid UTF-8: {}", dir.display());
            break;
        };

        if let Some(project) = dir_name_to_project(dir_name) {
            return Ok(Some(project));
        }

        current_dir = dir.parent().map(|dir| dir.to_path_buf());
    }

    Ok(None)
}

pub fn dir_name_to_project(name: &str) -> Option<Project> {
    match name {
        "traefik" => Some(Project::Traefik),
        "infra" => Some(Project::Infra),
        "apigateway" => Some(Project::ApiGateway),
        "gateway" | "gateway-app" => Some(Project::Gateway),
        "rates" => Some(Project::Rates),
        "search" => Some(Project::Search),
        "operations" => Some(Project::Operations),
        "foundation" => Some(Project::Foundation),
        "products" => Some(Project::Products),
        "app" | "hummingbird-app" => Some(Project::App),
        "nest" | "nest-app" => Some(Project::Nest),
        _ => None,
    }
}

#[derive(Debug, Deserialize)]
pub struct ProjectEnv {
    pub db_database: String,
    pub db_password: String,
}

#[tracing::instrument]
pub async fn read_project_env(project: &Project) -> eyre::Result<Option<ProjectEnv>> {
    tracing::info!("Reading environment for project: {}", project.name());

    let Some(project_dir) = project.dir_name() else {
        return Ok(None);
    };

    let hbt_root = get_hbt_root()?;
    let env_path = hbt_root.join(project_dir).join(".env");

    if !env_path.exists() {
        return Ok(None);
    }

    let env = crate::env::read_env(&env_path).await?;

    Ok(Some(env))
}
