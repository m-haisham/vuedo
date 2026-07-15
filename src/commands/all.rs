use std::time::Duration;

use indicatif::{MultiProgress, ProgressBar, ProgressStyle};
use strum::IntoEnumIterator;

use crate::{
    context::AppContext,
    docker::{self, Container},
    project::Project,
    requirements::get_project_requirements,
    ui::BrushContext,
};

use crate::git;

pub async fn start_all_projects(args: &[String]) -> eyre::Result<()> {
    let containers = Container::iter();

    for container in containers {
        docker::compose_up(&container.compose_file()?, args).await?;
    }

    Ok(())
}

pub async fn stop_all_projects(args: &[String]) -> eyre::Result<()> {
    let compose_paths = Container::iter()
        .map(|c| c.compose_file().map(|path| (c, path)))
        .collect::<Result<Vec<_>, _>>()?;

    let multi_progress = MultiProgress::new();
    let style = ProgressStyle::default_bar()
        .template("{spinner:.green} [{elapsed_precise}] {msg}")?
        .progress_chars("#>-");

    let handles = compose_paths.iter().map(|(c, path)| {
        let pb = multi_progress.add(ProgressBar::new_spinner());
        pb.set_style(style.clone());
        pb.set_message(format!("Stopping {:?}", c));
        pb.enable_steady_tick(Duration::from_millis(100));
        let args = args.to_vec();
        let pb_clone = pb.clone();

        async move {
            let result = docker::compose_down(path, &args).await;
            match result {
                Ok(_) => {
                    pb_clone.set_style(
                        ProgressStyle::default_bar()
                            .template("{prefix:.green} [{elapsed_precise}] {msg}")?
                            .progress_chars("#>-"),
                    );
                    pb_clone.set_prefix("✔");
                    pb_clone.finish_with_message(format!("Stopped {:?}", c));
                }
                Err(ref e) => {
                    pb_clone.set_style(
                        ProgressStyle::default_bar()
                            .template("{prefix:.red} [{elapsed_precise}] {msg}")?
                            .progress_chars("#>-"),
                    );
                    pb_clone.set_prefix("✖");
                    pb_clone.finish_with_message(format!("Error stopping {:?}: {}", c, e));
                }
            }
            result
        }
    });

    // We can ignore the results of the futures since they are already handled by the progress bars.
    let _ = futures::future::join_all(handles).await;

    Ok(())
}

pub async fn run_git_command_all_projects(
    context: AppContext,
    args: Vec<String>,
) -> eyre::Result<()> {
    let brush = BrushContext::new_from_context(&context);

    let args = args.iter().map(|v| v.as_str()).collect::<Vec<_>>();

    for project in Project::iter() {
        let project_name = brush
            .styles
            .bold
            .apply_to(format!("{}:", project.dir_name()))
            .to_string();

        brush.write_line(&project_name)?;

        let project_dir = project.dir()?;
        git::git_command(&project_dir, &args).await?;

        brush.write_newline()?;
    }

    Ok(())
}

pub async fn run_artisan_command_all_projects(
    context: AppContext,
    rest: &[String],
) -> eyre::Result<()> {
    let brush = BrushContext::new_from_context(&context);

    for project in Project::iter() {
        let requirements = get_project_requirements(&project);
        if !requirements.artisan {
            continue;
        }

        let Some(container) = project.container() else {
            continue;
        };

        let project_name = brush
            .styles
            .bold
            .apply_to(format!("{}:", project.dir_name()))
            .to_string();

        brush.write_line(&project_name)?;

        let compose_file = container.compose_file()?;

        let mut args = vec!["php-fpm", "php", "artisan"];
        args.extend(rest.iter().map(|s| s.as_str()));
        docker::compose_exec(&compose_file, &args).await?;

        brush.write_newline()?;
    }

    Ok(())
}
