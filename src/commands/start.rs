use color_eyre::Section;
use eyre::eyre;

use crate::{
    context::AppContext,
    docker::ping_docker,
    git::{GitRepoList, WorkingBranch},
    ui::BrushContext,
};

use super::{print_branches, start_all_projects};

#[tracing::instrument(skip_all)]
pub async fn start_work(context: AppContext) -> eyre::Result<()> {
    let brush = BrushContext::new_from_context(&context);

    ping_docker()
        .await
        .map_err(|e| eyre!(e))
        .with_suggestion(|| "Failed to connect to docker. Make sure docker is running.")?;

    brush.heading("Starting project containers...")?;
    start_all_projects(&[]).await?;

    let repo_list = GitRepoList::new(&context.working_dir).await?;

    brush.write_newline()?;
    brush.heading("Branches:")?;
    print_branches(&context).await?;

    brush.write_newline()?;
    check_working_branch(&brush, &repo_list).await?;

    Ok(())
}

pub async fn check_working_branch(
    brush: &BrushContext<'_>,
    repo_list: &GitRepoList,
) -> eyre::Result<()> {
    let working_branch = repo_list.get_working_branch();

    match working_branch {
        WorkingBranch::None => {
            brush.write_warning("⚠️  No active feature branch detected.")?;
            brush.write_warning("You are not currently working on any feature branch.")?;
        }
        WorkingBranch::Single(branch) => {
            let message = format!(
                "✅ You are currently working on the feature branch: {}",
                brush.styles.bold.apply_to(branch)
            );
            brush.write_line(&message)?;
        }
        WorkingBranch::Multiple(branches) => {
            brush.write_warning("⚠️  Multiple active feature branches detected:")?;
            brush.indented(|brush| {
                for branch in branches {
                    let branch_message = format!("• {}", branch);
                    brush.write_warning(&branch_message)?;
                }
                Ok::<_, eyre::Report>(())
            })?;
            brush.write_newline()?;
            brush.write_warning(
                "⚠️  It is recommended to clean up your feature branches to avoid potential conflicts.",
            )?;
        }
    }

    Ok(())
}
