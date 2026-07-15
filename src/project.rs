use clap::Parser;
use eyre::{eyre, WrapErr};
use std::{env::set_current_dir, path::Path};

pub const HBT_PROJECTS: [&str; 1] = ["gateway"];

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

#[derive(Debug, Parser)]
pub enum ProjectCommands {
    Up { rest: Vec<String> },
    Down { rest: Vec<String> },
}
