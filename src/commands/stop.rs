use crate::context::AppContext;

use super::stop_all_projects;

#[tracing::instrument(skip_all)]
pub async fn stop_work(context: AppContext) -> eyre::Result<()> {
    stop_all_projects(&[]).await?;
    Ok(())
}
