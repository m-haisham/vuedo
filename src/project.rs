use eyre::{eyre, WrapErr};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use std::fmt::Display;
use strum::EnumIter;

use crate::{docker::Container, env::get_hbt_root};

#[derive(Debug, Hash, Copy, Clone, Serialize, Deserialize, EnumIter, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum Project {
    Gateway,
    Rates,
    Search,
    Operations,
    Foundation,
    Products,
    ApiGateway,
    App,
    Nest,
    SoPackageSerializer,
    ApiClients,
    GroundHandlingApp,
}

impl Project {
    pub fn name(&self) -> &str {
        match self {
            Project::Gateway => "gateway",
            Project::Rates => "rates",
            Project::Search => "search",
            Project::Operations => "operations",
            Project::Foundation => "foundation",
            Project::Products => "products",
            Project::ApiGateway => "apigateway",
            Project::App => "app",
            Project::Nest => "nest",
            Project::SoPackageSerializer => "so-package-serializer",
            Project::ApiClients => "api-clients",
            Project::GroundHandlingApp => "agents-mobile-app",
        }
    }

    pub fn dir_name(&self) -> &str {
        match self {
            Project::Gateway => "gateway-app",
            Project::Rates => "rates",
            Project::Search => "search",
            Project::Operations => "operations",
            Project::Foundation => "foundation",
            Project::Products => "products",
            Project::ApiGateway => "apigateway",
            Project::App => "hummingbird-app",
            Project::Nest => "nest-app",
            Project::SoPackageSerializer => "so-package-serializer",
            Project::ApiClients => "api-clients",
            Project::GroundHandlingApp => "agents-mobile-app",
        }
    }

    pub fn dir(&self) -> eyre::Result<std::path::PathBuf> {
        let hbt_root = get_hbt_root()?;
        let project_dir = hbt_root.join(self.dir_name());
        Ok(project_dir)
    }

    pub fn container(&self) -> Option<Container> {
        match self {
            Project::Gateway => Some(Container::Gateway),
            Project::Rates => Some(Container::Rates),
            Project::Search => Some(Container::Search),
            Project::Operations => Some(Container::Operations),
            Project::Foundation => Some(Container::Foundation),
            Project::Products => Some(Container::Products),
            Project::ApiGateway => Some(Container::ApiGateway),
            Project::App => Some(Container::App),
            Project::Nest => Some(Container::Nest),
            Project::SoPackageSerializer => None,
            Project::ApiClients => None,
            Project::GroundHandlingApp => None,
        }
    }
}

impl Display for Project {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "{}",
            match self {
                Project::Gateway => "Gateway",
                Project::Rates => "Rates",
                Project::Search => "Search",
                Project::Operations => "Operations",
                Project::Foundation => "Foundation",
                Project::Products => "Products",
                Project::ApiGateway => "ApiGateway",
                Project::App => "App",
                Project::Nest => "Nest",
                Project::SoPackageSerializer => "SoPackageSerializer",
                Project::ApiClients => "ApiClients",
                Project::GroundHandlingApp => "GroundHandlingApp",
            }
        )
    }
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
        "apigateway" => Some(Project::ApiGateway),
        "gateway" | "gateway-app" => Some(Project::Gateway),
        "rates" => Some(Project::Rates),
        "search" => Some(Project::Search),
        "operations" => Some(Project::Operations),
        "foundation" => Some(Project::Foundation),
        "products" => Some(Project::Products),
        "app" | "hummingbird-app" => Some(Project::App),
        "nest" | "nest-app" => Some(Project::Nest),
        "so-package-serializer" => Some(Project::SoPackageSerializer),
        "api-clients" => Some(Project::ApiClients),
        _ => None,
    }
}

#[derive(Debug, Deserialize)]
pub struct ProjectEnv {
    pub db_database: String,
    pub db_password: String,
}

#[tracing::instrument]
pub fn read_project_env<T>(project: &Project) -> eyre::Result<Option<T>>
where
    T: DeserializeOwned,
{
    tracing::info!("Reading environment for project: {}", project.name());

    let hbt_root = get_hbt_root()?;
    let env_path = hbt_root.join(project.dir_name()).join(".env");

    if !env_path.exists() {
        return Ok(None);
    }

    let env = crate::env::read_env(&env_path)?;

    Ok(Some(env))
}
