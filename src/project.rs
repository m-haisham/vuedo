use clap::Parser;
use eyre::{eyre, WrapErr};
use std::{env::set_current_dir, path::Path};

pub const HBT_PROJECTS: [&str; 11] = [
    "traefik",
    "infra",
    "gateway",
    "rates",
    "search",
    "operations",
    "foundation",
    "products",
    "apigateway",
    "app",
    "nest",
];

pub async fn set_project(app: &str) -> eyre::Result<()> {
    let hbt_docker_root = std::env::var("HBT_DOCKER_ROOT")
        .map_err(|e| eyre!(e))
        .wrap_err("HBT_DOCKER_ROOT not set")?;

    let project_dir = Path::new(&hbt_docker_root).join(format!("hbt-{}", app));

    set_current_dir(project_dir)
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to change directory")?;

    Ok(())
}

pub fn detect_project() -> eyre::Result<Option<String>> {
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
            return Ok(Some(project.to_string()));
        }

        current_dir = dir.parent().map(|dir| dir.to_path_buf());
    }

    Ok(None)
}

pub fn dir_name_to_project<'a>(name: &str) -> Option<&'static str> {
    match name {
        "traefik" => Some("traefik"),
        "infra" => Some("infra"),
        "apigateway" => Some("api"),
        "gateway" | "gateway-app" => Some("gateway"),
        "rates" => Some("rates"),
        "search" => Some("search"),
        "operations" => Some("operations"),
        "foundation" => Some("foundation"),
        "products" => Some("products"),
        "app" => Some("app"),
        "nest" | "nest-app" => Some("nest"),
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
}
