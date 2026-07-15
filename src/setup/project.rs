use std::path::Path;

use dialoguer::MultiSelect;
use eyre::{eyre, WrapErr};
use itertools::Itertools;
use strum::IntoEnumIterator;

use crate::project::{get_project_dir, Project};

pub async fn setup_projects(non_interactive: bool) -> eyre::Result<()> {
    let projects = if non_interactive {
        tracing::info!("Non-interactive mode enabled, skipping project selection");
        Project::iter().collect_vec()
    } else {
        prompt_projects()?
    };

    for project in projects {
        tracing::info!("Setting up project: {}", project);

        let project_dir = get_project_dir(&project)?;
        if project_dir.exists() {
            tracing::info!(
                "Project directory already exists: {}",
                project_dir.display()
            );
            continue;
        }

        setup_project(&project, &project_dir).await?;
    }

    Ok(())
}

fn prompt_projects() -> eyre::Result<Vec<Project>> {
    let required_projects = vec![Project::Traefik, Project::Infra];

    let mut projects = Project::iter()
        .filter(|p| !required_projects.contains(p))
        .collect::<Vec<_>>();

    let selected_indexes = MultiSelect::new()
        .with_prompt("Select the projects you want to setup")
        .items(&projects)
        .interact()
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to get input")?;

    let selected_projects = required_projects
        .into_iter()
        .chain(
            selected_indexes
                .into_iter()
                .map(|index| projects.swap_remove(index)),
        )
        .collect_vec();

    Ok(selected_projects)
}

pub async fn setup_project(project: &Project, project_dir: &Path) -> eyre::Result<()> {
    Ok(())
}
