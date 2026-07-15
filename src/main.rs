mod cli;
mod docker;
mod doctor;
mod env;
mod git;
mod global;
mod infra;
mod kebab;
mod project;
mod zip;

use std::path::PathBuf;

use clap::Parser;
use cli::{Cli, Commands, GlobalCommands};
use eyre::{eyre, Context};
use git::current_branch;
use infra::set_current_infra;
use kebab::kebabify;
use project::{dir_name_to_project, set_current_project, Project, ProjectCommands};
use tracing::level_filters::LevelFilter;

#[tokio::main]
pub async fn main() -> eyre::Result<()> {
    let cli = Cli::parse();

    let level = match cli.verbose {
        0 => LevelFilter::ERROR,
        1 => LevelFilter::WARN,
        2 => LevelFilter::INFO,
        3 => LevelFilter::DEBUG,
        _ => LevelFilter::TRACE,
    };

    tracing_subscriber::fmt()
        .with_max_level(level)
        .compact()
        .init();

    match cli.command {
        Commands::Doctor => {
            let health = doctor::check_health().await?;
            println!("{}", health);
        }
        Commands::Dump => {}
        Commands::Global { command } => match command {
            GlobalCommands::Up { rest } => {
                global::start_all_projects(&rest).await?;
            }
            GlobalCommands::Down { rest } => {
                global::stop_all_projects(&rest).await?;
            }
            GlobalCommands::Restart { rest } => {
                global::stop_all_projects(&rest).await?;
                global::start_all_projects(&rest).await?;
            }
        },
        Commands::Project(args) => {
            let app = args
                .get(0)
                .cloned()
                .ok_or_else(|| eyre::eyre!("No command provided"))?;

            if let Some(project) = dir_name_to_project(&app) {
                let command = ProjectCommands::parse_from(args.into_iter());
                project_command(project, command).await?;
            } else if let Some(app) = project::detect_project()? {
                let mut project_args = vec![app.name().to_string()];
                project_args.extend(args.into_iter());

                let command = ProjectCommands::parse_from(project_args.into_iter());

                project_command(app, command).await?;
            } else {
                eyre::bail!("No project detected and no project provided");
            }
        }
    }

    Ok(())
}

async fn project_command(project: Project, command: ProjectCommands) -> eyre::Result<()> {
    set_current_project(&project).await?;

    match command {
        ProjectCommands::Up { rest } => {
            docker::compose_up(&rest).await?;
        }
        ProjectCommands::Down { rest } => {
            docker::compose_down(&rest).await?;
        }
        ProjectCommands::Restart { rest } => {
            docker::compose_down(&rest).await?;
            docker::compose_up(&rest).await?;
        }
        ProjectCommands::Shell { rest } => {
            let mut args = vec!["php-fpm", "/bin/bash"];
            args.extend(rest.iter().map(|s| s.as_str()));
            docker::compose_exec(&args).await?;
        }
        ProjectCommands::Node { rest } => {
            let mut args = vec!["node", "node"];
            args.extend(rest.iter().map(|s| s.as_str()));
            docker::compose_exec(&args).await?;
        }
        ProjectCommands::Npm { rest } => {
            let mut args = vec!["node", "npm"];
            args.extend(rest.iter().map(|s| s.as_str()));
            docker::compose_exec(&args).await?;
        }
        ProjectCommands::Yarn { rest } => {
            let mut args = vec!["node", "yarn"];
            args.extend(rest.iter().map(|s| s.as_str()));
            docker::compose_exec(&args).await?;
        }
        ProjectCommands::Php { rest } => {
            let mut args = vec!["php-fpm", "php"];
            args.extend(rest.iter().map(|s| s.as_str()));
            docker::compose_exec(&args).await?;
        }
        ProjectCommands::Artisan { rest } => {
            let mut args = vec!["php-fpm", "php", "artisan"];
            args.extend(rest.iter().map(|s| s.as_str()));
            docker::compose_exec(&args).await?;
        }
        ProjectCommands::Composer { rest } => {
            let mut args = vec!["php-fpm", "composer"];
            args.extend(rest.iter().map(|s| s.as_str()));
            docker::compose_exec(&args).await?;
        }
        ProjectCommands::Phpunit { rest } => {
            let mut args = vec!["php-fpm", "php", "vendor/bin/phpunit"];
            args.extend(rest.iter().map(|s| s.as_str()));
            docker::compose_exec(&args).await?;
        }
        ProjectCommands::Dump { key } => {
            let infra_env = infra::get_infra_env().await?;
            set_current_infra()?;

            let hbt_root = std::env::var("HBT_ROOT")
                .map_err(|e| eyre!(e))
                .wrap_err("HBT_ROOT not set")?;

            let timestamp = chrono::Utc::now().format("%Y-%m-%dT%H-%M-%S");
            let key = match key {
                Some(key) => key.to_string(),
                None => {
                    let branch = current_branch().await?;
                    kebabify(&branch).into_inner()
                }
            };

            let dump_file = PathBuf::from(hbt_root)
                .join("dumps")
                .join(format!("{timestamp}_{}_{key}.sql.gz", project.name()));

            if let Some(dump_dir) = dump_file.parent() {
                std::fs::create_dir_all(dump_dir)
                    .map_err(|e| eyre!(e))
                    .wrap_err("Failed to create dump directory")?;
            }

            let dump = docker::mysql_dump(project.name(), &infra_env.mysql_db_password).await?;
            tracing::info!("Dumped {} bytes", dump.len());

            let dump = zip::gzip(&dump).await?;
            tracing::info!("Compressed dump to {} bytes", dump.len());

            std::fs::write(&dump_file, dump)
                .map_err(|e| eyre!(e))
                .wrap_err("Failed to write dump to file")?;

            tracing::info!("Wrote dump to file {}", dump_file.display());
        }
        ProjectCommands::Restore { path } => {
            let infra_env = infra::get_infra_env().await?;
            set_current_infra()?;

            let dump = std::fs::read(path)
                .map_err(|e| eyre!(e))
                .wrap_err("Failed to read dump file")?;

            tracing::info!("Read dump from file {} bytes", dump.len());

            let dump = zip::gunzip(&dump).await?;
            tracing::info!("Decompressed dump to {} bytes", dump.len());

            docker::mysql_restore(
                project.name(),
                &infra_env.mysql_db_password,
                dump.as_bytes(),
            )
            .await?;

            tracing::info!("Restored dump to {}", project.name());
        }
    }

    Ok(())
}
