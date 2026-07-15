use crate::{context::AppContext, ui::BrushContext};

use super::stop_all_projects;

#[tracing::instrument(skip_all)]
pub async fn stop_work(context: AppContext) -> eyre::Result<()> {
    let brush = BrushContext::new_from_context(&context);

    brush.heading("Stopping project containers...")?;
    stop_all_projects(&[]).await?;

    Ok(())
}
