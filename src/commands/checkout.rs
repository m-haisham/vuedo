use std::env::set_current_dir;

use eyre::{eyre, WrapErr};
use serde::Deserialize;
use strum::IntoEnumIterator;

use crate::{
    docker, env, git,
    project::{read_project_env, Project},
};

pub async fn checkout(branch: Option<String>, migrate: bool) -> eyre::Result<()> {
    let branch = match branch {
        Some(branch) => branch,
        None => {
            let current_branch = git::current_branch()
                .await
                .map_err(|e| eyre!(e))
                .wrap_err("Failed to get current branch")?;

            tracing::info!(
                "No branch specified, using current branch: {}",
                current_branch
            );

            current_branch
        }
    };

    for project in Project::iter() {
        let Some(dir_name) = project.dir_name() else {
            tracing::debug!(
                "Skipping {} because it has no defined directory",
                project.name()
            );

            continue;
        };

        let hbt_root = env::get_hbt_root()?;
        let project_dir = hbt_root.join(dir_name);

        set_current_dir(project_dir)
            .map_err(|e| eyre!(e))
            .wrap_err("Failed to set current project")?;

        let checkout_result = git::checkout(&branch).await;
        if let Err(e) = checkout_result {
            tracing::warn!("Failed to checkout branch for project: {}", e);
            continue;
        }

        if migrate {
            let migrate_result = migrate_project_db(&project).await;
            if let Err(e) = migrate_result {
                tracing::error!("Failed to migrate database for project: {}", e);
                continue;
            }
        }
    }

    Ok(())
}

async fn migrate_project_db(project: &Project) -> eyre::Result<()> {
    tracing::info!("Migrating database for project: {}", project);

    #[derive(Debug, Deserialize)]
    struct Env {
        db_database: Option<String>,
    }

    let project_env = read_project_env::<Env>(project)
        .await
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to read project environment")?;

    let Some(project_env) = project_env else {
        tracing::info!("No environment file found for project, skipping migration");
        return Ok(());
    };

    if project_env.db_database.is_none() {
        tracing::info!("No database found for project, skipping migration");
        return Ok(());
    }

    docker::compose_exec(&["migrate"])
        .await
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to run database migrations")?;

    Ok(())
}
