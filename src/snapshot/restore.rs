use std::{
    fs::{self, File, OpenOptions},
    io::{self, BufReader, BufWriter, Seek},
    path::Path,
};

use eyre::{eyre, Context};

use crate::{
    compress,
    context::{AppContext, WorkingDir},
    db, git,
    project::{read_project_env, ProjectEnv},
};

use super::{
    types::{MysqlDump, RepositoryFile, RepositorySnapshot, SnapshotManifest},
    utils::hash_as_hex,
    MANIFEST_FILE,
};

#[tracing::instrument(skip_all)]
pub async fn restore_snapshot(context: AppContext, zip_path: &Path) -> eyre::Result<()> {
    tracing::info!("Restoring snapshot from: {}", zip_path.display());

    let data_dir = context
        .data_dir()
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to retrieve data directory")?;

    let unzipped_dir = compress::unzip_to_dir_temp(&data_dir, zip_path)
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to unzip snapshot")?;

    let manifest = read_manifest_from_snapshot(unzipped_dir.path())?;

    for repository in manifest.repositories {
        restore_repository(&context.working_dir, unzipped_dir.path(), &repository).await?;
    }

    for dump in manifest.mysql_dumps {
        restore_mysql_dump(unzipped_dir.path(), &dump).await?;
    }

    Ok(())
}

fn read_manifest_from_snapshot(snapshot_dir: &Path) -> eyre::Result<SnapshotManifest> {
    let manifest_path = snapshot_dir.join(MANIFEST_FILE);
    let manifest = std::fs::read_to_string(&manifest_path)
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to read manifest file")?;

    let manifest: SnapshotManifest = serde_json::from_str(&manifest)
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to parse manifest JSON")?;

    Ok(manifest)
}

async fn restore_repository(
    working_dir: &WorkingDir,
    snapshot_dir: &Path,
    repository_snapshot: &RepositorySnapshot,
) -> eyre::Result<()> {
    tracing::info!("Restoring repository: {}", repository_snapshot.repository);

    let repository_dir = repository_snapshot.repository.dir()?;

    working_dir
        .with_working_dir(&repository_dir, async |_| {
            // Disabled as it might be too risky to do automatically.
            // git::set_origin(&repository_snapshot.origin).await?;

            git::checkout(&repository_snapshot.branch).await?;

            if let Some(patch_file) = &repository_snapshot.patch_file {
                let full_path = &snapshot_dir.join(&patch_file.path);
                git::git_apply(&full_path).await?;
            }
            Ok(())
        })
        .await?;

    for repository_file in &repository_snapshot.files {
        restore_repository_files(snapshot_dir, &repository_dir, repository_file).await?;
    }

    Ok(())
}

#[tracing::instrument(
    skip_all,
    fields(
        restore_path = %repository_file.restore_path.display()
    )
)]
async fn restore_repository_files(
    snapshot_dir: &Path,
    repository_dir: &Path,
    repository_file: &RepositoryFile,
) -> eyre::Result<()> {
    tracing::info!(
        "Restoring repository file: {}",
        repository_file.restore_path.display()
    );

    let file_path = snapshot_dir.join(&repository_file.file.path);
    if !file_path.exists() {
        return Err(eyre!("Repository file not found: {}", file_path.display()));
    }

    let file = File::open(&file_path)
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to open repository file for reading")?;

    let mut file_reader = BufReader::new(file);
    let actual_hash = hash_as_hex(&mut file_reader)?;
    file_reader
        .rewind()
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to rewind repository file")?;

    if actual_hash == repository_file.file.hash {
        tracing::info!("Repository file hash matches expected hash")
    } else {
        return Err(eyre!(
            "Hash mismatch for repository file: {}",
            file_path.display()
        ));
    }

    let restore_path = repository_dir.join(&repository_file.restore_path);
    if let Some(parent) = restore_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| eyre!(e))
            .wrap_err_with(|| {
                format!(
                    "Failed to create parent directory for restore path: {}",
                    parent.display()
                )
            })?;
    }

    let restore_file = OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(&restore_path)
        .map_err(|e| eyre!(e))
        .wrap_err_with(|| format!("Failed to open restore file: {}", restore_path.display()))?;

    let mut restore_writer = BufWriter::new(restore_file);
    io::copy(&mut file_reader, &mut restore_writer)
        .map_err(|e| eyre!(e))
        .wrap_err_with(|| {
            format!(
                "Failed to copy data to restore file: {}",
                restore_path.display()
            )
        })?;

    Ok(())
}

#[tracing::instrument(
    skip_all,
    fields(
        dump_name = %dump.file.name,
    ),
)]
async fn restore_mysql_dump(snapshot_dir: &Path, dump: &MysqlDump) -> eyre::Result<()> {
    tracing::info!("Restoring MySQL dump: {}", dump.file.path.display());

    let file_path = snapshot_dir.join(&dump.file.path);
    if !file_path.exists() {
        return Err(eyre!("Mysql dump file not found: {}", file_path.display()));
    }

    let file = File::open(&file_path)
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to open mysql dump file for reading")?;

    let mut reader = BufReader::new(file);
    let actual_hash = hash_as_hex(&mut reader)?;
    reader
        .rewind()
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to rewind file reader")?;

    if actual_hash == dump.file.hash {
        tracing::info!("MySQL dump hash matches expected hash");
    } else {
        return Err(eyre!(
            "Hash mismatch for mysql dump file: {}",
            file_path.display()
        ));
    }

    let project_env = read_project_env::<ProjectEnv>(&dump.project)
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to read project environment")?
        .ok_or_else(|| {
            eyre!(
                "Environment file not found for project: {}",
                dump.project.name()
            )
        })?;

    db::restore(&dump.project, &project_env, &dump.file.path).await?;

    Ok(())
}
