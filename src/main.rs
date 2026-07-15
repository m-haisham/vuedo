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
mod snapshot;
mod ui;
mod update;
mod utils;

use clap::Parser;
use cli::{Cli, Commands, GlobalCommands, ProjectCommands, SnapshotCommands};
use color_eyre::config::HookBuilder;
use commands::{get_config, print_config, set_config};
use context::AppContext;
use docker::Container;
use eyre::{bail, eyre, Context};
use git::current_branch;
use infra::set_current_infra;
use kebab::kebabify;
use project::{dir_name_to_project, Project};
use snapshot::SnapshotOptions;
use std::path::PathBuf;
use tracing::level_filters::LevelFilter;

#[tokio::main]
pub async fn main() -> eyre::Result<()> {
    let cli = Cli::parse();

    let context = AppContext::new(cli.verbose, cli.non_interactive)
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to initialize app context")?;

    HookBuilder::default()
        .display_location_section(cli.verbose >= 3)
        .display_env_section(false)
        .install()?;

    let level = match cli.verbose {
        0 => LevelFilter::OFF,
        1 => LevelFilter::WARN,
        2 => LevelFilter::INFO,
        3 => LevelFilter::DEBUG,
        _ => LevelFilter::TRACE,
    };

    tracing_subscriber::fmt()
        .with_max_level(level)
        .compact()
        .init();

    #[cfg(not(debug_assertions))]
    update::update_prompt(cli.non_interactive).await?;

    match cli.command {
        Commands::Start => {
            commands::start_work(context).await?;
        }
        Commands::Stop => {
            commands::stop_work(context).await?;
        }
        Commands::Doctor => {
            doctor::check_health(context).await?;
        }
        Commands::Setup => {
            setup::setup(cli.non_interactive).await?;
        }
        Commands::Dump { key } => {
            commands::dump_all_project_dbs(context, key).await?;
        }
        Commands::Restore { key } => {
            commands::restore_all_project_dbs(context, key).await?;
        }
        Commands::Branch => {
            commands::print_branches(&context).await?;
        }
        Commands::Checkout { branch, migrate } => {
            commands::checkout(context, branch, migrate).await?
        }
        Commands::Push => {
            commands::push_all_projects(context).await?;
        }
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
        Commands::Snapshot { command } => match command {
            SnapshotCommands::Create {
                generate_patch,
                include_databases,
            } => {
                let options = SnapshotOptions {
                    generate_patch,
                    include_databases,
                };

                snapshot::create_snapshot(context, options).await?;
            }
            SnapshotCommands::Restore { path } => {
                snapshot::restore_snapshot(context, &path).await?;
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
            project_command(context, None, Container::Traefik, command).await?;
        }
        Commands::Infra { command } => {
            project_command(context, None, Container::Infra, command).await?;
        }
        Commands::Gateway { command } => {
            project_command(context, Some(Project::Gateway), Container::Gateway, command).await?;
        }
        Commands::Rates { command } => {
            project_command(context, Some(Project::Rates), Container::Rates, command).await?;
        }
        Commands::Search { command } => {
            project_command(context, Some(Project::Search), Container::Search, command).await?;
        }
        Commands::Operations { command } => {
            project_command(
                context,
                Some(Project::Operations),
                Container::Operations,
                command,
            )
            .await?;
        }
        Commands::Foundation { command } => {
            project_command(
                context,
                Some(Project::Foundation),
                Container::Foundation,
                command,
            )
            .await?;
        }
        Commands::Products { command } => {
            project_command(
                context,
                Some(Project::Products),
                Container::Products,
                command,
            )
            .await?;
        }
        Commands::Api { command } => {
            project_command(
                context,
                Some(Project::ApiGateway),
                Container::ApiGateway,
                command,
            )
            .await?;
        }
        Commands::App { command } => {
            project_command(context, Some(Project::App), Container::App, command).await?;
        }
        Commands::Nest { command } => {
            project_command(context, Some(Project::Nest), Container::Nest, command).await?;
        }
        Commands::Fallthrough(args) => {
            let app = args
                .first()
                .cloned()
                .ok_or_else(|| eyre::eyre!("No command provided"))?;

            if let Some(project) = dir_name_to_project(&app) {
                let Some(container) = project.container() else {
                    bail!("This project does not have a docker container to run commands on");
                };

                let command = ProjectCommands::parse_from(args.into_iter());
                project_command(context, Some(project), container, command).await?;
            } else if let Some(project) = project::detect_project()? {
                let Some(container) = project.container() else {
                    bail!("This project does not have a docker container to run commands on");
                };

                let mut project_args = vec![project.name().to_string()];
                project_args.extend(args.into_iter());

                let command = ProjectCommands::parse_from(project_args.into_iter());

                project_command(context, Some(project), container, command).await?;
            } else {
                eyre::bail!("No project detected and no project provided");
            }
        }
    }

    Ok(())
}

async fn project_command(
    _context: AppContext,
    project: Option<Project>,
    container: Container,
    command: ProjectCommands,
) -> eyre::Result<()> {
    let compose_file = container.compose_file()?;

    match command {
        ProjectCommands::Up { rest } => {
            docker::compose_up(&compose_file, &rest).await?;
        }
        ProjectCommands::Down { rest } => {
            docker::compose_down(&compose_file, &rest).await?;
        }
        ProjectCommands::Restart { rest } => {
            docker::compose_down(&compose_file, &rest).await?;
            docker::compose_up(&compose_file, &rest).await?;
        }
        ProjectCommands::Shell { rest } => {
            let mut args = vec!["php-fpm", "/bin/bash"];
            args.extend(rest.iter().map(|s| s.as_str()));
            docker::compose_exec(&compose_file, &args).await?;
        }
        ProjectCommands::Node { rest } => {
            let mut args = vec!["node", "node"];
            args.extend(rest.iter().map(|s| s.as_str()));
            docker::compose_exec(&compose_file, &args).await?;
        }
        ProjectCommands::Npm { rest } => {
            let mut args = vec!["node", "npm"];
            args.extend(rest.iter().map(|s| s.as_str()));
            docker::compose_exec(&compose_file, &args).await?;
        }
        ProjectCommands::Yarn { rest } => {
            let mut args = vec!["node", "yarn"];
            args.extend(rest.iter().map(|s| s.as_str()));
            docker::compose_exec(&compose_file, &args).await?;
        }
        ProjectCommands::Php { rest } => {
            let mut args = vec!["php-fpm", "php"];
            args.extend(rest.iter().map(|s| s.as_str()));
            docker::compose_exec(&compose_file, &args).await?;
        }
        ProjectCommands::Artisan { rest } => {
            let mut args = vec!["php-fpm", "php", "artisan"];
            args.extend(rest.iter().map(|s| s.as_str()));
            docker::compose_exec(&compose_file, &args).await?;
        }
        ProjectCommands::Composer { rest } => {
            let mut args = vec!["php-fpm", "composer"];
            args.extend(rest.iter().map(|s| s.as_str()));
            docker::compose_exec(&compose_file, &args).await?;
        }
        ProjectCommands::Phpunit { rest } => {
            let mut args = vec!["php-fpm", "php", "vendor/bin/phpunit"];
            args.extend(rest.iter().map(|s| s.as_str()));
            docker::compose_exec(&compose_file, &args).await?;
        }
        ProjectCommands::Dump { key } => {
            let Some(project) = project else {
                eyre::bail!("No project provided");
            };

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

            let compose_file = Container::Infra.compose_file()?;

            let dump =
                docker::mysql_dump(&compose_file, project.name(), &infra_env.mysql_db_password)
                    .await?;
            tracing::info!("Dumped {} bytes", dump.len());

            let dump = compress::gzip(&dump).await?;
            tracing::info!("Compressed dump to {} bytes", dump.len());

            std::fs::write(&dump_file, dump)
                .map_err(|e| eyre!(e))
                .wrap_err("Failed to write dump to file")?;

            tracing::info!("Wrote dump to file {}", dump_file.display());
        }
        ProjectCommands::Restore { path } => {
            let Some(project) = project else {
                eyre::bail!("No project provided");
            };

            let infra_env = infra::get_infra_env().await?;
            set_current_infra()?;

            let dump = std::fs::read(path)
                .map_err(|e| eyre!(e))
                .wrap_err("Failed to read dump file")?;

            tracing::info!("Read dump from file {} bytes", dump.len());

            let dump = compress::gunzip(&dump).await?;
            tracing::info!("Decompressed dump to {} bytes", dump.len());

            let compose_file = Container::Infra.compose_file()?;

            docker::mysql_restore(
                &compose_file,
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
