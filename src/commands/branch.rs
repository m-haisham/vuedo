use console::Style;
use eyre::{Context, eyre};
use strum::IntoEnumIterator;

use crate::{
    context::AppContext,
    git,
    project::{Project, detect_project},
    ui::BrushContext,
};

pub async fn print_branches(context: &AppContext) -> eyre::Result<()> {
    let current_project = detect_project()?;
    let current_branch = git::current_branch().await.ok();

    for project in Project::iter() {
        let project_dir = project.dir()?;

        let (branch, commit) = context
            .working_dir
            .with_working_dir(&project_dir, async |_| {
                let branch = git::current_branch()
                    .await
                    .map_err(|e| eyre!(e))
                    .wrap_err("Failed to get current branch")?;

                let commit = git::current_commit().await;

                Ok((branch, commit))
            })
            .await?;

        let has_uncommitted = git::has_uncommitted_changes(&project_dir)
            .await
            .unwrap_or(false);

        let has_unpushed = git::has_unpushed_commits(&project_dir)
            .await
            .unwrap_or(false);

        let draw = BrushContext::new_from_context(&context);

        let mut status = String::new();
        if has_uncommitted {
            status.push_str(&draw.styles.error.apply_to('✗').to_string());
        }
        if has_unpushed {
            status.push_str(&draw.styles.warning.apply_to('↑').to_string());
        }

        let style = Style::new();

        let style = if Some(&project) == current_project.as_ref() {
            style.bold()
        } else {
            style
        };

        let style = if Some(&branch) == current_branch.as_ref() {
            style.green()
        } else {
            style
        };

        let commit_output = match commit {
            Ok(commit) => {
                let commit = format!(
                    "; {} {}",
                    commit.short_hash,
                    commit.message.unwrap_or_default()
                );
                Style::new().apply_to(commit)
            }
            Err(e) => {
                let error = format!("; {}", e);
                Style::new().red().apply_to(error)
            }
        };

        let value = format!(
            "{}{}{}",
            if !status.is_empty() {
                format!("{} ", status)
            } else {
                "".to_string()
            },
            style.apply_to(branch),
            commit_output
        );

        draw.labeled_styled(project.name(), &value, &style)?;
    }

    Ok(())
}
