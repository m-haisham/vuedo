use std::path::Path;

use eyre::eyre;

use crate::{
    docker, git,
    project::{read_project_env, Project},
    ui::{components::LabeledLine, traits::Draw},
};

use super::requirements::get_project_requirements;

#[derive(Debug)]
#[allow(dead_code)]
pub struct ProjectHealth {
    pub project: Project,
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

impl ProjectDbHealth {
    pub fn url(&self) -> String {
        let host = self.host.as_deref().unwrap_or("localhost");
        let port = self.port.unwrap_or(3306);
        let database = self.database.as_deref().unwrap_or("");
        let username = self.username.as_deref().unwrap_or("");
        let password = self.password.as_deref().unwrap_or("");

        format!(
            "mysql://{}:{}@{}:{}/{}",
            username, password, host, port, database
        )
    }
}

pub async fn check_project_health(project: Project, dir: &Path) -> eyre::Result<ProjectHealth> {
    let exists = dir.exists();
    let git_branch = git::current_branch().await.ok();
    let git_origin = git::current_origin().await.ok();

    #[derive(Debug, serde::Deserialize)]
    struct ProjectEnv {
        db_host: Option<String>,
        db_port: Option<u16>,
        db_database: Option<String>,
        db_username: Option<String>,
        db_password: Option<String>,
    }

    let env = read_project_env::<ProjectEnv>(&project).ok().flatten();

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

    Ok(ProjectHealth {
        project,
        exists,
        git_branch,
        git_origin,
        db,
    })
}

impl Draw for ProjectHealth {
    fn draw_compact(&self, brush: &crate::ui::BrushContext<'_>) -> eyre::Result<()> {
        let mut values = vec![];
        let mut errors = vec![];

        if !self.exists {
            errors.push(format!(
                "Project not found at expected location: {}",
                self.project.dir()?.display()
            ));
        }

        if let Some(git_branch) = &self.git_branch {
            values.push(git_branch.to_string());
        } else {
            errors.push("Unable to determine git branch".to_owned());
        }

        if let None = &self.git_origin {
            errors.push("Unable to determine git origin".to_owned());
        }

        let requirements = get_project_requirements(&self.project);
        if requirements.database {
            if let Some(db) = &self.db {
                if db.connect.is_ok() {
                    values.push("Database connected".to_owned());
                } else {
                    errors.push(format!("Unable to connect to database at {}", db.url()));
                }
            } else {
                errors.push("Unable to determine database".to_owned());
            }
        }

        LabeledLine::labeled(self.project.name().to_string())
            .with_values(values)
            .with_errors(errors)
            .draw(brush)?;

        Ok(())
    }

    fn draw_verbose(&self, brush: &crate::ui::BrushContext<'_>) -> eyre::Result<()> {
        self.draw_compact(brush)
    }
}

fn printable<T: ToString>(value: Option<&T>) -> String {
    value
        .map(|v| v.to_string())
        .unwrap_or("Not set".to_string())
}
