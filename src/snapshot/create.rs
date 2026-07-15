use std::{
    env::current_dir,
    fs::{self, create_dir_all, File},
    io::{BufReader, BufWriter, Seek, SeekFrom, Write},
    path::Path,
};

use chrono::Utc;
use color_eyre::Section;
use eyre::{eyre, Context};
use glob::glob;
use itertools::Itertools;
use strum::IntoEnumIterator;
use tempfile::TempDir;

use super::{
    types::{MysqlDump, RepositoryFile, RepositorySnapshot, SnapshotManifest, SnapshotOptions},
    utils::{get_pack_repository_file_path, get_pack_repository_random_file_path},
};
use crate::{
    compress,
    context::{AppContext, WorkingDir},
    db,
    git::{self, Repository},
    snapshot::{types::SnapshotFile, utils::hash_as_hex, MANIFEST_FILE, MYSQL_DUMPS_DIR},
};

#[tracing::instrument(skip_all)]
pub async fn create_snapshot(context: AppContext, options: SnapshotOptions) -> eyre::Result<()> {
    tracing::info!("Creating snapshot...");

    let data_dir = context.data_dir()?;

    let temp_dir = tempfile::tempdir_in(&data_dir)
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to create temporary directory")?;

    // This is just for logging purposes, the performance impact is acceptable.
    let temp_dir_name = temp_dir
        .path()
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| temp_dir.path().display().to_string());

    tracing::info!(
        "Created temporary directory to pack snapshot: {}",
        temp_dir_name
    );

    let repositories =
        create_repository_snapshots(&options, &temp_dir, &context.working_dir).await?;

    let mysql_dumps = store_database_dumps(&temp_dir, &options)
        .await
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to store database dumps")?;

    let manifest = SnapshotManifest {
        repositories,
        mysql_dumps,
        created_at: Utc::now(),
    };

    store_manifest(&temp_dir, &manifest)
        .await
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to store manifest")?;

    let snapshot_file = tempfile::tempfile_in(&data_dir)
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to create snapshot file")?;

    let snapshot_file = pack_snapshot(&temp_dir, snapshot_file)
        .await
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to pack snapshot")?;

    let output_path = current_dir()?.join("snapshot.zip");
    copy_snapshot(snapshot_file, &output_path)
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to copy snapshot")?;

    Ok(())
}

#[tracing::instrument(skip_all)]
pub async fn create_repository_snapshots(
    options: &SnapshotOptions,
    temp_dir: &TempDir,
    working_dir: &WorkingDir,
) -> eyre::Result<Vec<RepositorySnapshot>> {
    tracing::info!("Creating repository snapshots...");

    let repositories_to_snapshot = match options.include_repositories.clone() {
        Some(repositories) => repositories,
        _ => Repository::iter().collect_vec(),
    };

    let mut snapshots = vec![];
    for repository in repositories_to_snapshot {
        let snapshot = repository_snapshot(options, temp_dir, working_dir, repository).await?;
        snapshots.push(snapshot);
    }

    Ok(snapshots)
}

#[tracing::instrument(skip_all)]
pub async fn repository_snapshot(
    options: &SnapshotOptions,
    temp_dir: &TempDir,
    working_dir: &WorkingDir,
    repository: Repository,
) -> eyre::Result<RepositorySnapshot> {
    tracing::info!("Creating snapshot for repository: {}", repository);

    let repository_dir = repository.dir()?;
    let (git_info, patch_file) = working_dir
        .with_working_dir(&repository_dir, async |_| {
            let git_info = git::git_info().await?;

            let patch_file = if options.generate_patch {
                let patch_file = repository_patch_file(temp_dir, repository).await?;
                Some(patch_file)
            } else {
                None
            };

            Ok((git_info, patch_file))
        })
        .await?;

    let files = repository_files(temp_dir, repository).await?;

    let snapshot = RepositorySnapshot {
        repository,
        branch: git_info.branch,
        origin: git_info.origin,
        patch_file,
        files,
    };

    Ok(snapshot)
}

#[tracing::instrument(skip_all)]
pub async fn repository_patch_file(
    temp_dir: &TempDir,
    repository: Repository,
) -> eyre::Result<SnapshotFile> {
    tracing::info!("Creating git patch file for repository: {}", repository);

    let output_path_relative = get_pack_repository_random_file_path(repository)
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to get output path")?;

    let output_path = temp_dir.path().join(&output_path_relative);
    if let Some(parent) = output_path.parent() {
        create_dir_all(parent)
            .map_err(|e| eyre!(e))
            .wrap_err_with(|| {
                format!(
                    "Failed to create parent directory of patch file: {}",
                    parent.display(),
                )
            })?;
    }

    let output = git::git_diff()
        .await
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to create git diff")?;

    fs::write(&output_path, output)
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to write diff to output file")?;

    tracing::info!(
        "Created git patch file for repository ({}) at {}",
        repository,
        output_path.display()
    );

    let output_file = File::open(&output_path)
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to open output file")?;

    let output_metadata = output_file
        .metadata()
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to get output file metadata")?;

    let mut output_reader = BufReader::new(output_file);
    let hash = hash_as_hex(&mut output_reader)
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to hash output file")?;

    Ok(SnapshotFile {
        name: "git.patch".to_string(),
        path: output_path_relative,
        size: output_metadata.len(),
        hash,
    })
}

pub async fn repository_files(
    temp_dir: &TempDir,
    repository: Repository,
) -> eyre::Result<Vec<RepositoryFile>> {
    let repository_dir = repository.dir()?;
    let repository_dir_str = repository_dir
        .to_str()
        .ok_or_else(|| eyre!("Failed to convert repository directory to string"))?;

    let mut files = Vec::new();

    let pattern = glob(&format!("{repository_dir_str}/**/.env"))
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to create glob pattern")?;

    for entry in pattern {
        let file_path = entry
            .map_err(|e| eyre!(e))
            .wrap_err("Failed to get file path")?;

        tracing::debug!("Processing repository file file: {}", file_path.display());

        let Some(file_name) = file_path.file_name() else {
            tracing::debug!("Skipping non-file in repository files");
            continue;
        };

        let file_name = file_name
            .to_str()
            .ok_or_else(|| eyre!("Failed to convert file name to string"))?;

        let file_path_relative = file_path
            .strip_prefix(&repository_dir)
            .map_err(|e| eyre!(e))
            .wrap_err("Failed to strip repository directory from file path")?;

        let metadata = file_path
            .metadata()
            .map_err(|e| eyre!(e))
            .wrap_err("Failed to get file metadata")?;

        let file = File::open(&file_path)
            .map_err(|e| eyre!(e))
            .wrap_err("Failed to open dump file")?;

        let mut file_reader = BufReader::new(file);
        let hash = hash_as_hex(&mut file_reader)?;
        file_reader.rewind()?;

        let pack_path_relative = get_pack_repository_file_path(repository, file_path_relative)?;
        let pack_path = temp_dir.path().join(&pack_path_relative);

        if let Some(parent) = pack_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| eyre!(e))
                .wrap_err("Failed to create parent directory for pack file")?;
        }

        let pack_file = File::create(&pack_path)
            .map_err(|e| eyre!(e))
            .wrap_err("Failed to create pack file")?;

        let mut pack_writer = BufWriter::new(pack_file);
        std::io::copy(&mut file_reader, &mut pack_writer)?;

        tracing::info!(
            "Packed file from {} to {}",
            file_path.display(),
            pack_path.display()
        );

        let snapshot_file = SnapshotFile {
            name: file_name.to_string(),
            path: pack_path_relative,
            size: metadata.len(),
            hash,
        };

        let repository_file = RepositoryFile {
            file: snapshot_file,
            restore_path: file_path_relative.to_path_buf(),
        };

        files.push(repository_file);
    }

    Ok(files)
}

pub async fn store_database_dumps(
    temp_dir: &TempDir,
    options: &SnapshotOptions,
) -> eyre::Result<Vec<MysqlDump>> {
    tracing::info!("Dumping databases for snapshot...");

    let mysql_dumps_dir = temp_dir.path().join(MYSQL_DUMPS_DIR);
    if !mysql_dumps_dir.exists() {
        std::fs::create_dir(&mysql_dumps_dir)
            .map_err(|e| eyre!(e))
            .wrap_err("Failed to create MySQL dumps directory")?;
    }

    let configured_dbs = db::get_configured_dbs().await?;
    let mut database_dumps = vec![];

    let databases_to_dump = match options.include_databases.as_ref() {
        Some(include_databases) => {
            let databases_not_found = include_databases
                .iter()
                .filter(|db| {
                    !configured_dbs
                        .iter()
                        .find(|conf| conf.db_database == db.as_str())
                        .is_some()
                })
                .cloned()
                .collect::<Vec<_>>();

            if !databases_not_found.is_empty() {
                return Err(eyre!(
                    "Databases not found: {}",
                    databases_not_found.join(", ")
                ))
                .with_suggestion(|| {
                    let available_databases =
                        configured_dbs.iter().map(|db| &db.db_database).join(", ");
                    format!("Please select from the following: {}", available_databases)
                });
            }

            configured_dbs
                .into_iter()
                .filter(|db| include_databases.contains(&db.db_database))
                .collect::<Vec<_>>()
        }
        None => configured_dbs,
    };

    for project_db in databases_to_dump {
        tracing::info!("Dumping database {}", project_db.project.name());

        let (dump_name, dump_path) = db::dump_project(&project_db, &mysql_dumps_dir)
            .await
            .wrap_err_with(|| format!("Failed to dump database {}", project_db.project.name()))?;

        let dump_path_relative = dump_path
            .strip_prefix(temp_dir.path())
            .map_err(|e| eyre!(e))
            .wrap_err("Failed to get relative path to database dump")?;

        let file = File::open(&dump_path)
            .map_err(|e| eyre!(e))
            .wrap_err("Failed to open dump file")?;

        let metadata = file
            .metadata()
            .map_err(|e| eyre!(e))
            .wrap_err("Failed to get file metadata")?;

        let size = metadata.len();

        let mut reader = BufReader::new(file);
        let hash = hash_as_hex(&mut reader)?;

        let dump = MysqlDump {
            project: project_db.project,
            file: SnapshotFile {
                name: dump_name,
                path: dump_path_relative.to_path_buf(),
                size,
                hash,
            },
        };

        database_dumps.push(dump);
    }

    Ok(database_dumps)
}

pub async fn store_manifest(tempdir: &TempDir, manifest: &SnapshotManifest) -> eyre::Result<()> {
    tracing::info!("Storing manifest as {}...", MANIFEST_FILE);

    let manifest_path = tempdir.path().join(MANIFEST_FILE);
    let manifest_json = serde_json::to_string_pretty(manifest)
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to serialize manifest")?;

    let file = File::create(&manifest_path)
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to create manifest file")?;

    let mut writer = BufWriter::new(file);

    writer
        .write_all(manifest_json.as_bytes())
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to write manifest to file")?;

    Ok(())
}

pub async fn pack_snapshot(tempdir: &TempDir, snapshot_file: File) -> eyre::Result<File> {
    tracing::info!("Packing manifest into zip file...");

    let writer = std::io::BufWriter::new(snapshot_file);

    let writer = compress::zip_dir(writer, tempdir.path())
        .await
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to compress snapshot")?;

    let mut snapshot_file = writer
        .into_inner()
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to finalize snapshot file")?;

    snapshot_file
        .seek(SeekFrom::Start(0))
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to seek snapshot file")?;

    Ok(snapshot_file)
}

pub fn copy_snapshot(source: File, destination: &Path) -> eyre::Result<()> {
    tracing::info!("Copying final snapshot to {}...", destination.display());

    let mut reader = BufReader::new(source);

    let destination_file = File::create(destination)
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to create destination file")?;

    let mut writer = BufWriter::new(destination_file);

    std::io::copy(&mut reader, &mut writer)
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to copy snapshot")?;

    Ok(())
}
