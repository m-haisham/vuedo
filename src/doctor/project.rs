use std::path::Path;

use eyre::eyre;

use crate::{
    docker, git,
    project::{read_project_env, Project},
};

#[derive(Debug)]
#[allow(dead_code)]
pub struct ProjectHealth {
    pub exists: bool,
    pub git_branch: Option<String>,
    pub git_origin: Option<String>,
    pub db: Option<ProjectDbHealth>,
}

#[derive(Debug)]
pub struct ProjectDbHealth {
    pub host: Option<String>,
    pub port: Option<u16>,
    pub database: Option<String>,
    pub username: Option<String>,
    pub password: Option<String>,
    pub connect: Result<(), eyre::Report>,
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

    #[derive(Debug, serde::Deserialize)]
    struct ProjectEnv {
        db_host: Option<String>,
        db_port: Option<u16>,
        db_database: Option<String>,
        db_username: Option<String>,
        db_password: Option<String>,
    }

    let env = read_project_env::<ProjectEnv>(&project)
        .await
        .ok()
        .flatten();

    let db_connect = if let Some((Some(database), Some(password))) = env
        .as_ref()
        .map(|env| (env.db_database.as_ref(), env.db_password.as_ref()))
    {
        docker::mysql_check_connect(database, password).await
    } else {
        Err(eyre!("Database not configured"))
    };

    let db = env.map(|env| ProjectDbHealth {
        host: env.db_host,
        port: env.db_port,
        database: env.db_database,
        username: env.db_username,
        password: env.db_password,
        connect: db_connect,
    });

    if let Some(db) = &db {
        println!("  - Database:");
        println!("    - Host: {}", printable(db.host.as_ref()));
        println!("    - Port: {}", printable(db.port.as_ref()));
        println!("    - Database: {}", printable(db.database.as_ref()));
        println!("    - Username: {}", printable(db.username.as_ref()));
        println!("    - Password: {}", printable(db.password.as_ref()));
        if let Err(e) = &db.connect {
            println!("    - Connect: Failed ({})", e);
        } else {
            println!("    - Connect: Success");
        }
    } else {
        println!("  - Database: Not set");
    }

    Ok(ProjectHealth {
        exists,
        git_branch,
        git_origin,
        db,
    })
}

fn printable<T: ToString>(value: Option<&T>) -> String {
    value
        .map(|v| v.to_string())
        .unwrap_or("Not set".to_string())
}
