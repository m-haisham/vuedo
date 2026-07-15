use bollard::Docker;
use color_eyre::Section;

use crate::{context::AppContext, docker::ping_docker, ui::BrushContext};

use super::start_all_projects;

#[tracing::instrument(skip_all)]
pub async fn start_work(context: AppContext) -> eyre::Result<()> {
    let brush = BrushContext::new_from_context(&context);

    ping_docker()
        .await
        .with_suggestion(|| "Failed to connect to docker. Make sure docker is running.")?;

    brush.heading("Starting project containers...")?;
    start_all_projects(&[]).await?;

    Ok(())
}
