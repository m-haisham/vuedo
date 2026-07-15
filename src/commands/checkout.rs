use std::env::set_current_dir;

use console::{style, Style};
use eyre::{eyre, WrapErr};
use serde::Deserialize;
use strum::IntoEnumIterator;

use crate::{
    context::AppContext,
    docker::{self, Container},
    git,
    project::{read_project_env, Project},
    ui::BrushContext,
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

    let draw = BrushContext::new_from_context(&context);
    draw.write_line(&format!(
        "Checking out branch: {} (fallback to 'develop')",
        style(&branch).bold()
    ))?;

    for project in Project::iter() {
        let project_dir = project.dir()?;

        set_current_dir(project_dir)
            .map_err(|e| eyre!(e))
            .wrap_err("Failed to set current project")?;

        let checkout_result = git::checkout_first(&[branch.as_str(), "develop"]).await;

        let migrate_result = if let Some(container) = project.container() {
            if migrate {
                let migrate_result = migrate_project_db(&project, &container).await;
                if let Err(e) = migrate_result {
                    tracing::error!("Failed to migrate database for project: {}", e);
                    continue;
                }
                Some(migrate_result)
            } else {
                None
            }
        } else {
            None
        };

        let line_style = match checkout_result {
            Ok(applied_branch) if applied_branch == branch => Style::new().green(),
            Ok(_) => Style::new(),
            Err(_) => Style::new().red(),
        };

        let checkout_output = match checkout_result {
            Ok(applied_branch) => applied_branch.to_string(),
            Err(e) => e.to_string(),
        };

        let migrate_output = match migrate_result {
            Some(Ok(_)) => style("Migrated").green().to_string(),
            Some(Err(e)) => format!("Migration failed: {}", style(e.to_string()).red()),
            None => style("Migration skipped").dim().to_string(),
        };

        let value = format!(
            "{}; {}",
            line_style.apply_to(checkout_output),
            migrate_output
        );

        draw.labeled_styled(project.name(), &value, &line_style)?;
    }

    Ok(())
}

async fn migrate_project_db(project: &Project, container: &Container) -> eyre::Result<()> {
    tracing::info!("Migrating database for project: {}", project);

    #[derive(Debug, Deserialize)]
    struct Env {
        db_database: Option<String>,
    }

    let project_env = read_project_env::<Env>(project)
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

    let compose_file = container.compose_file()?;

    docker::compose_exec(&compose_file, &["php-fpm", "php", "artisan", "migrate"])
        .await
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to run database migrations")?;

    Ok(())
}
