use strum::IntoEnumIterator;

use crate::docker::{self, Container};

pub async fn start_all_projects(args: &[String]) -> eyre::Result<()> {
    let containers = Container::iter();

    for container in containers {
        docker::compose_up(&container.compose_file()?, args).await?;
    }

    Ok(())
}

pub async fn stop_all_projects(args: &[String]) -> eyre::Result<()> {
    let containers = Container::iter();

    for container in containers {
        docker::compose_down(&container.compose_file()?, args).await?;
    }

    Ok(())
}
