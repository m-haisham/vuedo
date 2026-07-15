use std::path::PathBuf;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::{git::Repository, project::Project};

#[derive(Debug)]
pub struct SnapshotOptions {
    pub include_repositories: Option<Vec<Repository>>,
    pub generate_patch: bool,
    pub include_databases: Option<Vec<String>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SnapshotManifest {
    pub repositories: Vec<RepositorySnapshot>,
    pub mysql_dumps: Vec<MysqlDump>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MysqlDump {
    pub file: SnapshotFile,
    pub project: Project,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SnapshotFile {
    pub name: String,
    pub path: PathBuf,
    pub size: u64,
    pub hash: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RepositorySnapshot {
    pub repository: Repository,
    pub origin: String,
    pub branch: String,
    pub patch_file: Option<SnapshotFile>,
    pub files: Vec<RepositoryFile>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RepositoryFile {
    pub file: SnapshotFile,
    pub restore_path: PathBuf,
}
