use strum::IntoEnumIterator;

use crate::{
    docker,
    project::{set_current_project, Project},
};

pub async fn start_all_projects(args: &[String]) -> eyre::Result<()> {
    for project in Project::iter() {
        set_current_project(&project).await?;
        docker::compose_up(args).await?;
    }

    Ok(())
}

pub async fn stop_all_projects(args: &[String]) -> eyre::Result<()> {
    for project in Project::iter() {
        set_current_project(&project).await?;
        docker::compose_down(args).await?;
    }

    Ok(())
}
