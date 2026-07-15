use eyre::{eyre, WrapErr};
use itertools::Itertools;
use std::path::{Path, PathBuf};

use strum::IntoEnumIterator;

use crate::{
    compress,
    docker::{self, Container},
    env::get_hbt_docker_root,
    infra::set_current_infra,
    project::{read_project_env, Project, ProjectEnv},
};

#[derive(Debug, Clone, Hash, PartialEq, Eq)]
pub struct ProjectDb {
    pub project: Project,
    pub db_database: String,
    pub db_password: String,
}

pub async fn get_configured_dbs() -> eyre::Result<Vec<ProjectDb>> {
    let mut project_dbs = vec![];

    for project in Project::iter() {
        let project_env = read_project_env::<ProjectEnv>(&project).await?;
        let Some(project_env) = project_env else {
            tracing::warn!("No environment found for {}", project.name());
            continue;
        };

        let project_db = ProjectDb {
            project,
            db_database: project_env.db_database,
            db_password: project_env.db_password,
        };

        project_dbs.push(project_db);
    }

    let project_dbs = project_dbs
        .into_iter()
        .unique_by(|db| db.db_database.to_string())
        // .filter(|db| db.db_database != "operations") // FIXME: Remove operations database
        // .filter(|db| db.db_database != "rates") // FIXME: Remove rates database
        // .filter(|db| db.db_database != "foundation") // FIXME: Remove foundation database
        .collect();

    Ok(project_dbs)
}

#[tracing::instrument(skip(db, dump_dir))]
pub async fn dump_project(db: &ProjectDb, dump_dir: &Path) -> eyre::Result<(String, PathBuf)> {
    let ProjectDb {
        project,
        db_database,
        db_password,
    } = db;

    tracing::info!("Dumping {}...", project.name());

    let compose_file = Container::Infra.compose_file()?;

    let dump_name = format!("{}.sql.gz", db_database);
    let dump_file = dump_dir.join(&dump_name);

    let dump = match docker::mysql_dump(&compose_file, db_database, db_password).await {
        Ok(dump) => dump,
        Err(e) => {
            return Err(eyre!(
                "Failed to dump database for {}: {}",
                project.name(),
                e
            ));
        }
    };

    tracing::info!("Dumped {} bytes", dump.len());

    let dump = compress::gzip(&dump).await?;
    tracing::info!("Compressed dump to {} bytes", dump.len());

    std::fs::write(&dump_file, dump)
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to write dump to file")?;

    tracing::info!("Wrote dump to file {}", dump_file.display());

    Ok((dump_name, dump_file))
}

pub async fn restore(db: &ProjectDb, dump_path: &Path) -> eyre::Result<()> {
    tracing::info!("Restoring dump for {}", db.project.name());

    let dump = std::fs::read(dump_path)
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to read dump file")?;

    tracing::info!("Read dump from file {} bytes", dump.len());

    let dump = compress::gunzip(&dump).await?;
    tracing::info!("Decompressed dump to {} bytes", dump.len());

    let compose_file = Container::Infra.compose_file()?;

    docker::mysql_restore(
        &compose_file,
        &db.db_database,
        &db.db_password,
        dump.as_bytes(),
    )
    .await?;

    tracing::info!("Restored dump to {}", db.project.name());

    Ok(())
}
