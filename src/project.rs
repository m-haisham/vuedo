use eyre::{eyre, WrapErr};
use serde::{de::DeserializeOwned, Deserialize};
use std::{env::set_current_dir, fmt::Display};
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
    DevEnvironment,
    App,
    Nest,
    SoPackageSerializer,
    ApiClient,
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
            Project::DevEnvironment => "dev-environment",
            Project::App => "app",
            Project::Nest => "nest",
            Project::SoPackageSerializer => "so-package-serializer",
            Project::ApiClient => "api-client",
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
            Project::DevEnvironment => Some("hbt-docker-dev-environment"),
            Project::App => Some("hummingbird-app"),
            Project::Nest => Some("nest-app"),
            Project::SoPackageSerializer => Some("so-package-serializer"),
            Project::ApiClient => Some("api-client"),
        }
    }

    pub fn git_url(&self) -> Option<&str> {
        match self {
            Project::Traefik => None,
            Project::Infra => None,
            Project::Gateway => Some("git@bitbucket.org:humtravel/gateway-app.git"),
            Project::Rates => Some("git@bitbucket.org:humtravel/rates.git"),
            Project::Search => Some("git@bitbucket.org:humtravel/search.git"),
            Project::Operations => Some("git@bitbucket.org:humtravel/operations.git"),
            Project::Foundation => Some("git@bitbucket.org:humtravel/foundation.git"),
            Project::Products => Some("git@bitbucket.org:humtravel/products.git"),
            Project::ApiGateway => Some("git@bitbucket.org:humtravel/apigateway.git"),
            Project::DevEnvironment => {
                Some("git@bitbucket.org:humtravel/hbt-docker-dev-environment.git")
            }
            Project::App => Some("git@bitbucket.org:humtravel/hummingbird-app.git"),
            Project::Nest => Some("git@bitbucket.org:humtravel/nest-app.git"),
            Project::SoPackageSerializer => {
                Some("git@bitbucket.org:humtravel/so-package-serializer.git")
            }
            Project::ApiClient => Some("git@bitbucket.org:humtravel/api-client.git"),
        }
    }

    pub fn has_docker(&self) -> bool {
        match self {
            Project::Traefik => true,
            Project::Infra => true,
            Project::Gateway => true,
            Project::Rates => true,
            Project::Search => true,
            Project::Operations => true,
            Project::Foundation => true,
            Project::Products => true,
            Project::ApiGateway => true,
            Project::DevEnvironment => false,
            Project::App => true,
            Project::Nest => true,
            Project::SoPackageSerializer => false,
            Project::ApiClient => false,
        }
    }
}

impl Display for Project {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "{}",
            match self {
                Project::Traefik => "Traefik",
                Project::Infra => "Infra",
                Project::Gateway => "Gateway",
                Project::Rates => "Rates",
                Project::Search => "Search",
                Project::Operations => "Operations",
                Project::Foundation => "Foundation",
                Project::Products => "Products",
                Project::ApiGateway => "ApiGateway",
                Project::DevEnvironment => "DevEnvironment",
                Project::App => "App",
                Project::Nest => "Nest",
                Project::SoPackageSerializer => "SoPackageSerializer",
                Project::ApiClient => "ApiClient",
            }
        )
    }
}

pub fn get_project_dir(project: &Project) -> eyre::Result<Option<std::path::PathBuf>> {
    let Some(project_dir) = project.dir_name() else {
        return Ok(None);
    };

    let hbt_root = get_hbt_root()?;
    let project_dir = hbt_root.join(project_dir);

    Ok(Some(project_dir))
}

/// FIXME: This function does not need to be async because it does not perform any async operations
///
/// FIXME: The name of this function is misleading, should specify it is setting
/// the current directory to the project docker environment
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
            tracing::debug!("Directory does not have a valid name: {}", dir.display());
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
pub async fn read_project_env<T>(project: &Project) -> eyre::Result<Option<T>>
where
    T: DeserializeOwned,
{
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
