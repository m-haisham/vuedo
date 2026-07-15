use std::path::Path;

use eyre::{eyre, Context};

use crate::{compress, context::AppContext};

use super::{types::SnapshotManifest, MANIFEST_FILE};

#[tracing::instrument(skip_all)]
pub async fn restore_snapshot(context: AppContext, zip_path: &Path) -> eyre::Result<()> {
    let data_dir = context
        .data_dir()
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to retrieve data directory")?;

    let unzipped_dir = compress::unzip_to_dir_temp(&data_dir, zip_path)
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to unzip snapshot")?;

    let manifest = read_manifest_from_snapshot(unzipped_dir.path())?;

    dbg!(manifest);

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
