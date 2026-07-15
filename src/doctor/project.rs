use std::path::Path;

use crate::{
    git,
    project::{read_project_env, Project, ProjectEnv},
};

#[derive(Debug)] // We expect this to be used in the future
#[allow(dead_code)]
pub struct ProjectHealth {
    pub exists: bool,
    pub git_branch: Option<String>,
    pub git_origin: Option<String>,
    pub env: Option<ProjectEnv>,
}

pub async fn check_project_health(project: Project, dir: &Path) -> eyre::Result<ProjectHealth> {
    println!("  {}", project.name());

    let exists = dir.exists();

    if exists {
        println!("  - Path: {}", dir.display());
    } else {
        println!("  - Path: Not set");
    }

    let git_branch = git::current_branch().await.ok();
    if let Some(ref git_branch) = git_branch {
        println!("  - Git branch: {}", git_branch);
    } else {
        println!("  - Git branch: Not set");
    }

    let git_origin = git::current_origin().await.ok();
    if let Some(ref git_origin) = git_origin {
        println!("  - Git origin: {}", git_origin);
    } else {
        println!("  - Git origin: Not set");
    }

    let env = read_project_env::<ProjectEnv>(&project)
        .await
        .ok()
        .flatten();

    if let Some(ref env) = env {
        println!("  - Environment:");
        println!("    - DB Database: {}", env.db_database);
        println!("    - DB Password: {}", env.db_password); // Development only
    } else {
        println!("  - Environment: Not set");
    }

    Ok(ProjectHealth {
        exists,
        git_branch,
        git_origin,
        env,
    })
}
