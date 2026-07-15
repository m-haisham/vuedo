mod types;

use std::{
    env::current_dir,
    fs::File,
    io::{BufReader, BufWriter, Seek, SeekFrom, Write},
    path::Path,
};

use chrono::Utc;
use eyre::{eyre, Context};
use hex::ToHex;
use sha2::Digest;
use tempfile::TempDir;
use tokio::{fs::create_dir_all, io::AsyncReadExt};
use types::{MysqlDump, SnapshotManifest};

use crate::{compress, context::AppContext, db};

const MYSQL_DUMPS_DIR: &str = "mysql_dumps";
const MANIFEST_FILE: &str = "manifest.json";

pub async fn create_snapshot(context: AppContext) -> eyre::Result<()> {
    tracing::info!("Creating snapshot...");

    let dirs = context.dirs()?;

    tracing::info!("Creating data directory: {}", dirs.data_dir().display());
    create_dir_all(dirs.data_dir())
        .await
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to create data directory")?;

    let tempdir = tempfile::tempdir_in(&dirs.data_dir())
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to create temporary directory")?;

    // This is just for logging purposes, the performance impact is acceptable.
    let tempdir_name = tempdir
        .path()
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| tempdir.path().display().to_string());

    tracing::info!(
        "Created temporary directory to pack snapshot: {}",
        tempdir_name
    );

    let mysql_dumps = store_database_dumps(&tempdir)
        .await
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to store database dumps")?;

    let manifest = SnapshotManifest {
        mysql_dumps,
        created_at: Utc::now(),
    };

    store_manifest(&tempdir, &manifest)
        .await
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to store manifest")?;

    let snapshot_file = tempfile::tempfile_in(&dirs.data_dir())
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to create snapshot file")?;

    let snapshot_file = pack_snapshot(&tempdir, snapshot_file)
        .await
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to pack snapshot")?;

    let output_path = current_dir()?.join("snapshot.zip");
    copy_snapshot(snapshot_file, &output_path)
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to copy snapshot")?;

    Ok(())
}

pub async fn store_database_dumps(temp_dir: &TempDir) -> eyre::Result<Vec<MysqlDump>> {
    tracing::info!("Dumping databases for snapshot...");

    let mysql_dumps_dir = temp_dir.path().join(MYSQL_DUMPS_DIR);
    if !mysql_dumps_dir.exists() {
        std::fs::create_dir(&mysql_dumps_dir)
            .map_err(|e| eyre!(e))
            .wrap_err("Failed to create MySQL dumps directory")?;
    }

    let configured_dbs = db::get_configured_dbs().await?;
    let mut database_dumps = vec![];

    for project_db in configured_dbs {
        tracing::info!("Dumping database {}", project_db.project.name());

        let (dump_name, dump_path) = db::dump_project(&project_db, &mysql_dumps_dir)
            .await
            .wrap_err_with(|| format!("Failed to dump database {}", project_db.project.name()))?;

        let dump_path_relative = dump_path
            .strip_prefix(temp_dir.path())
            .map_err(|e| eyre!(e))
            .wrap_err("Failed to get relative path to database dump")?;

        let file = tokio::fs::File::open(&dump_path)
            .await
            .map_err(|e| eyre!(e))
            .wrap_err("Failed to open dump file")?;

        let metadata = file
            .metadata()
            .await
            .map_err(|e| eyre!(e))
            .wrap_err("Failed to get file metadata")?;

        let size = metadata.len();
        let hash = hash_file(file).await?;

        let dump = MysqlDump {
            file: types::SnapshotFile {
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

pub async fn hash_file(file: tokio::fs::File) -> eyre::Result<String> {
    use sha2::Sha256;

    let mut reader = tokio::io::BufReader::new(file);
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 4096];

    loop {
        let read = reader
            .read(&mut buffer)
            .await
            .map_err(|e| eyre!(e))
            .wrap_err("Failed to read from file")?;

        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }

    Ok(hasher.finalize().encode_hex())
}
