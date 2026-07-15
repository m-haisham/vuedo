use std::env::set_current_dir;

use color_eyre::owo_colors::OwoColorize;
use eyre::{eyre, WrapErr};
use serde::Deserialize;
use strum::IntoEnumIterator;

use crate::{
    context::AppContext,
    docker, env, git,
    project::{read_project_env, set_current_project, Project},
    ui::DrawContext,
};

pub async fn checkout(
    context: AppContext,
    branch: Option<String>,
    migrate: bool,
) -> eyre::Result<()> {
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

    let draw = DrawContext::new_from_context(&context);

    for project in Project::iter() {
        let Some(dir_name) = project.dir_name() else {
            continue;
        };

        let hbt_root = env::get_hbt_root()?;
        let project_dir = hbt_root.join(dir_name);

        set_current_dir(project_dir)
            .map_err(|e| eyre!(e))
            .wrap_err("Failed to set current project")?;

        let checkout_result = git::checkout_first(&[branch.as_str(), "develop"]).await;

        let migrate_result = if migrate {
            let migrate_result = migrate_project_db(&project).await;
            if let Err(e) = migrate_result {
                tracing::error!("Failed to migrate database for project: {}", e);
                continue;
            }
            Some(migrate_result)
        } else {
            None
        };

        let checkout_output = match checkout_result {
            Ok(branch) => branch.to_string(),
            Err(e) => {
                format!("{}", e.to_string().red())
            }
        };

        let migrate_output = match migrate_result {
            Some(Ok(_)) => "Migrated".green().to_string(),
            Some(Err(e)) => format!("Migration failed: {}", e.to_string().red()),
            None => "Migration skipped".to_string(),
        };

        let value = format!("{}; {}", checkout_output, migrate_output);
        draw.draw_labeled(project.name(), &value)?;
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

    set_current_project(project)
        .await
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to set current project")?;

    docker::compose_exec(&["php-fpm", "php", "artisan", "migrate"])
        .await
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to run database migrations")?;

    Ok(())
}
