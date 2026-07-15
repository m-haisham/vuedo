use std::{
    fs::File,
    io::{BufReader, Seek},
    path::Path,
};

use eyre::{eyre, Context};

use crate::{
    compress,
    context::AppContext,
    db,
    project::{read_project_env, ProjectEnv},
};

use super::{
    types::{MysqlDump, SnapshotManifest},
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
