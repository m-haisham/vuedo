use dialoguer::MultiSelect;
use eyre::{eyre, WrapErr};
use itertools::Itertools;
use strum::IntoEnumIterator;

use crate::{
    git,
    project::{get_project_dir, Project},
};

pub async fn setup_projects(non_interactive: bool) -> eyre::Result<()> {
    let projects = if non_interactive {
        tracing::info!("Non-interactive mode enabled, skipping project selection");
        Project::iter().collect_vec()
    } else {
        prompt_projects()?
    };

    for project in projects {
        setup_project(&project).await?;
    }

    Ok(())
}

fn prompt_projects() -> eyre::Result<Vec<Project>> {
    let never_projects = vec![Project::Traefik, Project::Infra];
    let required_projects = vec![Project::DevEnvironment];

    let projects = Project::iter()
        .filter(|p| !required_projects.contains(p) && !never_projects.contains(p))
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
                .flat_map(|index| projects.get(index).cloned()),
        )
        .collect_vec();

    Ok(selected_projects)
}

#[tracing::instrument]
pub async fn setup_project(project: &Project) -> eyre::Result<()> {
    tracing::info!("Setting up project: {}", project);

    let Some(project_dir) = get_project_dir(project)? else {
        return Err(eyre!("Project directory not found"));
    };

    if project_dir.exists() && project_dir.is_file() {
        return Err(eyre!("Project directory is a file"));
    }

    if !project_dir.exists() {
        std::fs::create_dir_all(&project_dir)
            .map_err(|e| eyre!(e))
            .wrap_err("Failed to create project directory")?;

        let Some(git_url) = project.git_url() else {
            return Err(eyre!("Project does not have a git origin"));
        };

        git::git_clone(git_url, &project_dir)
            .await
            .wrap_err("Failed to clone project repository")?;

        tracing::info!("Cloned project repository to {}", project_dir.display());
    } else {
        tracing::info!("Project directory already exists, skipping cloning");
    }

    Ok(())
}
