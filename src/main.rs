mod cli;
mod commands;
mod compress;
mod config;
mod context;
mod db;
mod docker;
mod doctor;
mod env;
mod git;
mod infra;
mod kebab;
mod project;
mod setup;
mod storage;
mod ui;
mod update;
mod utils;

use std::{
    fs::File,
    io::{BufReader, BufWriter},
    path::PathBuf,
};

use clap::Parser;
use cli::{Cli, Commands, GlobalCommands, ProjectCommands};
use commands::{get_config, print_config, set_config};
use context::AppContext;
use dialoguer::{theme::ColorfulTheme, Confirm};
use env::get_hbt_root;
use eyre::{eyre, Context};
use git::current_branch;
use infra::set_current_infra;
use kebab::kebabify;
use project::{dir_name_to_project, set_current_project, Project};
use tracing::level_filters::LevelFilter;

#[tokio::main]
pub async fn main() -> eyre::Result<()> {
    let cli = Cli::parse();

    let context = AppContext::new(cli.verbose, cli.non_interactive)
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to initialize app context")?;

    let level = match cli.verbose {
        0 => LevelFilter::WARN,
        1 => LevelFilter::INFO,
        2 => LevelFilter::DEBUG,
        _ => LevelFilter::TRACE,
    };

    tracing_subscriber::fmt()
        .with_max_level(level)
        .compact()
        .init();

    #[cfg(not(debug_assertions))]
    update::update_prompt(cli.non_interactive).await?;

    match cli.command {
        Commands::Doctor => {
            doctor::check_health().await?;
        }
        Commands::Setup => {
            setup::setup(cli.non_interactive).await?;
        }
        Commands::Dump { key } => {
            set_current_infra()?;

            let dump_dir = get_hbt_root()?.join("dumps").join(key.as_ref());
            if dump_dir.exists() {
                if cli.non_interactive {
                    let confirm = Confirm::with_theme(&ColorfulTheme::default())
                        .with_prompt(format!(
                            "Dump directory {} already exists. Overwrite?",
                            dump_dir.display()
                        ))
                        .interact()
                        .map_err(|e| eyre!(e))
                        .wrap_err("Failed to prompt for confirmation")?;

                    if !confirm {
                        eyre::bail!("User declined to overwrite dump directory");
                    }
                }

                tracing::info!("Removing existing dump directory...");

                std::fs::remove_dir_all(&dump_dir)
                    .map_err(|e| eyre!(e))
                    .wrap_err("Failed to remove existing dump directory")?;
            }

            std::fs::create_dir_all(&dump_dir)
                .map_err(|e| eyre!(e))
                .wrap_err("Failed to create dump directory")?;

            let configured_dbs = db::get_configured_dbs().await?;

            for project_db in configured_dbs {
                if let Err(e) = db::dump_project(&project_db, &dump_dir).await {
                    tracing::error!("{}", e);
                }
            }

            tracing::info!("Dumps written to {}", dump_dir.display());

            let dump_zip_path = get_hbt_root()?
                .join("dumps")
                .join(format!("{}.zip", key.as_ref()));

            let dump_zip_file = BufWriter::new(
                File::create(&dump_zip_path)
                    .map_err(|e| eyre!(e))
                    .wrap_err("Failed to create zip file")?,
            );

            compress::zip_dir(dump_zip_file, &dump_dir).await?;

            tracing::info!("Zipped dumps to {}", dump_zip_path.display());
        }
        Commands::Restore { key } => {
            let dump_zip_path = get_hbt_root()?
                .join("dumps")
                .join(format!("{}.zip", key.as_ref()));

            let dump_unzip_dir = get_hbt_root()?.join("dumps").join(key.as_ref());

            if dump_zip_path.exists() {
                let dump_zip_file = File::open(&dump_zip_path)
                    .map_err(|e| eyre!(e))
                    .wrap_err("Failed to open zip file")?;

                let dump_zip_file = BufReader::new(dump_zip_file);

                compress::unzip_dir(dump_zip_file, &dump_unzip_dir).await?;

                tracing::info!("Unzipped dumps to {}", dump_unzip_dir.display());
            } else if dump_unzip_dir.exists() {
                tracing::info!("No dump zip file found at {}", dump_zip_path.display());
            }

            if !dump_unzip_dir.exists() {
                tracing::info!("No dumps found to restore");
                return Ok(());
            }

            if !dump_unzip_dir.is_dir() {
                eyre::bail!("Dump directory found but is not a directory");
            }

            let configured_dbs = db::get_configured_dbs().await?;

            for project_db in configured_dbs {
                tracing::info!("Restoring dump for {}", project_db.project.name());

                let dump_file = dump_unzip_dir.join(format!("{}.sql.gz", project_db.db_database));

                if !dump_file.exists() {
                    tracing::debug!(
                        "No dump file found for {} ({})",
                        project_db.project.name(),
                        project_db.db_database,
                    );
                    continue;
                }

                if !dump_file.is_file() {
                    tracing::warn!("Skipping non-file dump for {}", project_db.project.name());
                    continue;
                }

                if !cli.non_interactive {
                    let confirm = Confirm::with_theme(&ColorfulTheme::default())
                        .with_prompt(format!(
                            "Restore dump for {} to {}?",
                            project_db.project.name(),
                            project_db.db_database
                        ))
                        .interact()
                        .map_err(|e| eyre!(e))
                        .wrap_err("Failed to prompt for confirmation")?;

                    if !confirm {
                        continue;
                    }
                }

                db::restore(&project_db, &dump_file).await?;
            }
        }
        Commands::Checkout { branch, migrate } => commands::checkout(branch, migrate).await?,
        Commands::All { command } => match command {
            GlobalCommands::Up { rest } => {
                commands::start_all_projects(&rest).await?;
            }
            GlobalCommands::Down { rest } => {
                commands::stop_all_projects(&rest).await?;
            }
            GlobalCommands::Restart { rest } => {
                commands::stop_all_projects(&rest).await?;
                commands::start_all_projects(&rest).await?;
            }
        },
        Commands::Config { key, value } => match (key, value) {
            (Some(key), Some(value)) => {
                set_config(key, value)?;
            }
            (Some(key), None) => {
                get_config(key)?;
            }
            (None, None) => {
                print_config()?;
            }
            (None, Some(_)) => {
                eyre::bail!("Value provided without key");
            }
        },
        Commands::Traefik { command } => {
            project_command(Project::Traefik, command).await?;
        }
        Commands::Infra { command } => {
            project_command(Project::Infra, command).await?;
        }
        Commands::Gateway { command } => {
            project_command(Project::Gateway, command).await?;
        }
        Commands::Rates { command } => {
            project_command(Project::Rates, command).await?;
        }
        Commands::Search { command } => {
            project_command(Project::Search, command).await?;
        }
        Commands::Operations { command } => {
            project_command(Project::Operations, command).await?;
        }
        Commands::Foundation { command } => {
            project_command(Project::Foundation, command).await?;
        }
        Commands::Products { command } => {
            project_command(Project::Products, command).await?;
        }
        Commands::Api { command } => {
            project_command(Project::ApiGateway, command).await?;
        }
        Commands::App { command } => {
            project_command(Project::App, command).await?;
        }
        Commands::Nest { command } => {
            project_command(Project::Nest, command).await?;
        }
        Commands::Fallthrough(args) => {
            let app = args
                .first()
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

            let dump = compress::gzip(&dump).await?;
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

            let dump = compress::gunzip(&dump).await?;
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
