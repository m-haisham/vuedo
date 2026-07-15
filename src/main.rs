mod cli;
mod docker;
mod doctor;
mod global;
mod project;

use clap::Parser;
use cli::{Cli, Commands, GlobalCommands};
use project::{set_project, ProjectCommands, HBT_PROJECTS};
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

            if HBT_PROJECTS.contains(&app.as_str()) {
                let command = ProjectCommands::parse_from(args.into_iter());

                project_command(app, command).await?;
            } else if let Some(app) = project::detect_project()? {
                let mut project_args = vec![app.clone()];
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

async fn project_command(app: String, command: ProjectCommands) -> eyre::Result<()> {
    set_project(&app).await?;

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
    }

    Ok(())
}
