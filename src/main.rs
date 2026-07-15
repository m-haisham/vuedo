use clap::Parser;
use cli::Cli;
use project::{set_project, ProjectCommands, HBT_PROJECTS};

mod cli;
mod docker;
mod project;

#[tokio::main]
pub async fn main() -> eyre::Result<()> {
    let cli = Cli::parse();

    match cli.command {
        cli::Commands::Up { rest } => {
            for app in HBT_PROJECTS {
                set_project(app).await?;
                docker::compose_up(&rest).await?;
            }
        }
        cli::Commands::Down { rest } => {
            for app in HBT_PROJECTS {
                set_project(app).await?;
                docker::compose_down(&rest).await?;
            }
        }
        cli::Commands::Project(args) => {
            let app = args
                .get(0)
                .cloned()
                .ok_or_else(|| eyre::eyre!("No app provided"))?;

            if HBT_PROJECTS.contains(&app.as_str()) {
                let command = ProjectCommands::parse_from(args.into_iter());

                println!("Running command: {:?}", command);

                project_command(app, command).await?;
            } else {
                println!("App not found");
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
    }

    Ok(())
}
