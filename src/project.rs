use clap::Parser;
use eyre::{eyre, WrapErr};
use std::{
    env::set_current_dir,
    path::{Path, PathBuf},
};
use strum::EnumIter;

use crate::kebab::Kebab;

#[derive(Debug, EnumIter)]
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
}

pub async fn set_current_project(project: &Project) -> eyre::Result<()> {
    tracing::info!("Setting current directory to {}", project.name());

    let hbt_docker_root = std::env::var("HBT_DOCKER_ROOT")
        .map_err(|e| eyre!(e))
        .wrap_err("HBT_DOCKER_ROOT not set")?;

    let project_dir = Path::new(&hbt_docker_root).join(format!("hbt-{}", project.name()));

    set_current_dir(project_dir)
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to change directory")?;

    Ok(())
}

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

#[derive(Debug, Parser)]
pub enum ProjectCommands {
    /// Start the project
    Up { rest: Vec<String> },
    /// Stop the project
    Down { rest: Vec<String> },
    /// Restart the project
    Restart { rest: Vec<String> },
    /// Start an interactive shell in the project
    Shell { rest: Vec<String> },
    /// Alias for node in the project
    Node { rest: Vec<String> },
    /// Alias for npm in the project
    Npm { rest: Vec<String> },
    /// Alias for yarn in the project
    Yarn { rest: Vec<String> },
    /// Alias for php in the project
    Php { rest: Vec<String> },
    /// Alias for artisan in the project
    Artisan { rest: Vec<String> },
    /// Alias for composer in the project
    Composer { rest: Vec<String> },
    /// Alias for phpunit in the project
    Phpunit { rest: Vec<String> },
    /// Dump the database
    Dump {
        /// A unique key to identify the dump
        key: Option<Kebab>,
    },
    /// Restore from a dump
    Restore {
        /// The path to the dump file
        path: PathBuf,
    },
}
