use strum::IntoEnumIterator;

use crate::{context::AppContext, git, project::Project, ui::BrushContext};

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
