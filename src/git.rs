use std::{
    collections::BTreeMap,
    fmt::{self, Display},
    path::{Path, PathBuf},
    str::FromStr,
};

use eyre::{eyre, Context};
use itertools::Itertools;
use serde::{Deserialize, Serialize};
use strum::{EnumIter, IntoEnumIterator};
use tokio::process::Command;

use crate::{context::WorkingDir, env};

#[derive(
    Copy, Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, Hash, EnumIter,
)]
#[serde(rename_all = "kebab-case")]
pub enum Repository {
    Gateway,
    Rates,
    Search,
    Operations,
    Foundation,
    Products,
    ApiGateway,
    DevEnvironment,
    App,
    Nest,
    SoPackageSerializer,
    ApiClients,
    GroundHandlingApp,
}

impl Repository {
    pub fn url(&self) -> &str {
        match self {
            Repository::Gateway => "git@bitbucket.org:humtravel/gateway-app.git",
            Repository::Rates => "git@bitbucket.org:humtravel/rates.git",
            Repository::Search => "git@bitbucket.org:humtravel/search.git",
            Repository::Operations => "git@bitbucket.org:humtravel/operations.git",
            Repository::Foundation => "git@bitbucket.org:humtravel/foundation.git",
            Repository::Products => "git@bitbucket.org:humtravel/products.git",
            Repository::ApiGateway => "git@bitbucket.org:humtravel/apigateway.git",
            Repository::DevEnvironment => {
                "git@bitbucket.org:humtravel/hbt-docker-dev-environment.git"
            }
            Repository::App => "git@bitbucket.org:humtravel/hummingbird-app.git",
            Repository::Nest => "git@bitbucket.org:humtravel/nest-app.git",
            Repository::SoPackageSerializer => {
                "git@bitbucket.org:humtravel/so-package-serializer.git"
            }
            Repository::ApiClients => "git@bitbucket.org:humtravel/api-clients.git",
            Repository::GroundHandlingApp => "git@bitbucket.org:humtravel/agents-mobile-app.git",
        }
    }

    pub fn dir_name(&self) -> &str {
        match self {
            Repository::Gateway => "gateway-app",
            Repository::Rates => "rates",
            Repository::Search => "search",
            Repository::Operations => "operations",
            Repository::Foundation => "foundation",
            Repository::Products => "products",
            Repository::ApiGateway => "apigateway",
            Repository::DevEnvironment => "hbt-docker-dev-environment",
            Repository::App => "hummingbird-app",
            Repository::Nest => "nest-app",
            Repository::SoPackageSerializer => "so-package-serializer",
            Repository::ApiClients => "api-clients",
            Repository::GroundHandlingApp => "agents-mobile-app",
        }
    }

    pub fn dir(&self) -> eyre::Result<PathBuf> {
        let hbt_root = env::get_hbt_root()?;
        let repository_dir = hbt_root.join(self.dir_name());
        Ok(repository_dir)
    }
}

impl Display for Repository {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(
            f,
            "{}",
            match self {
                Repository::Gateway => "gateway",
                Repository::Rates => "rates",
                Repository::Search => "search",
                Repository::Operations => "operations",
                Repository::Foundation => "foundation",
                Repository::Products => "products",
                Repository::ApiGateway => "apigateway",
                Repository::DevEnvironment => "dev-environment",
                Repository::App => "app",
                Repository::Nest => "nest",
                Repository::SoPackageSerializer => "so-package-serializer",
                Repository::ApiClients => "api-clients",
                Repository::GroundHandlingApp => "ground-handling-app",
            }
        )
    }
}

impl FromStr for Repository {
    type Err = eyre::Error;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "gateway" => Ok(Repository::Gateway),
            "rates" => Ok(Repository::Rates),
            "search" => Ok(Repository::Search),
            "operations" => Ok(Repository::Operations),
            "foundation" => Ok(Repository::Foundation),
            "products" => Ok(Repository::Products),
            "apigateway" => Ok(Repository::ApiGateway),
            "dev-environment" => Ok(Repository::DevEnvironment),
            "app" => Ok(Repository::App),
            "nest" => Ok(Repository::Nest),
            "so-package-serializer" => Ok(Repository::SoPackageSerializer),
            "api-clients" => Ok(Repository::ApiClients),
            "agents-mobile-app" => Ok(Repository::GroundHandlingApp),
            _ => Err(eyre!("Invalid repository name")),
        }
    }
}

pub async fn checkout(branch_name: &str) -> eyre::Result<()> {
    let output = Command::new("git")
        .arg("checkout")
        .arg(branch_name)
        .output()
        .await
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to checkout branch")?;

    if !output.status.success() {
        return Err(eyre!("Failed to checkout branch"));
    }

    Ok(())
}

/// Checkout the first branch in the list that exists in the project repository
pub async fn checkout_first<'a>(branches: &[&'a str]) -> eyre::Result<&'a str> {
    for branch in branches {
        let checkout_result = checkout(branch).await;
        match checkout_result {
            Ok(_) => return Ok(*branch),
            Err(e) => {
                // Some of these are expected, so we only log them as debug
                tracing::debug!("Failed to checkout branch: {}", e);
            }
        }
    }

    Err(eyre!(
        "None of the branches exist in the project repository"
    ))
}

pub async fn current_branch() -> eyre::Result<String> {
    let output = Command::new("git")
        .arg("branch")
        .arg("--show-current")
        .output()
        .await
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to get current branch")?;

    let branch = String::from_utf8(output.stdout)
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to parse branch name")?
        .trim()
        .to_owned();

    Ok(branch)
}

#[derive(Debug)]
pub struct GitCommit {
    pub hash: String,
    pub short_hash: String,
    pub message: Option<String>,
    pub long_message: Option<String>,
}

pub async fn current_commit() -> eyre::Result<GitCommit> {
    let output = Command::new("git")
        .arg("log")
        .arg("-1")
        .arg("--pretty=format:%H %s %b")
        .output()
        .await
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to get current commit")?;

    let output = String::from_utf8(output.stdout)
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to parse commit")?;

    let mut parts = output.splitn(2, ' ');

    let hash = parts
        .next()
        .ok_or_else(|| eyre!("Failed to parse commit hash"))?
        .to_owned();

    let short_hash = hash
        .get(..7)
        .ok_or_else(|| eyre!("Failed to get short hash"))?
        .to_owned();

    let full_message = parts
        .next()
        .ok_or_else(|| eyre!("Failed to get commit message"))?
        .trim();

    let mut message_parts = full_message.splitn(2, '\n');

    let message = message_parts.next().map(|s| s.trim().to_owned());
    let long_message = message_parts.next().map(|s| s.trim().to_owned());

    Ok(GitCommit {
        hash,
        short_hash,
        message,
        long_message,
    })
}

pub async fn current_origin() -> eyre::Result<String> {
    let output = Command::new("git")
        .arg("remote")
        .arg("get-url")
        .arg("origin")
        .output()
        .await
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to get origin URL")?;

    let origin = String::from_utf8(output.stdout)
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to parse origin URL")?
        .trim()
        .to_owned();

    Ok(origin)
}

pub async fn set_origin(url: &str) -> eyre::Result<()> {
    Command::new("git")
        .arg("remote")
        .arg("set-url")
        .arg("origin")
        .arg(url)
        .output()
        .await
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to set origin URL")?;

    Ok(())
}

pub async fn git_command(dir: &Path, args: &[&str]) -> eyre::Result<()> {
    Command::new("git")
        .current_dir(dir)
        .args(args)
        .status()
        .await
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to run git command")?;

    Ok(())
}

pub async fn git_clone(url: &str, dir: &Path) -> eyre::Result<()> {
    Command::new("git")
        .arg("clone")
        .arg(url)
        .arg(dir)
        .output()
        .await
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to clone repository")?;

    Ok(())
}

pub async fn git_diff() -> eyre::Result<String> {
    let output = Command::new("git")
        .arg("diff")
        .output()
        .await
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to generate diff")?;

    if output.status.success() {
        let stdout = String::from_utf8(output.stdout)
            .map_err(|e| eyre!(e))
            .wrap_err("Failed to convert git diff stdout to string")?;
        Ok(stdout)
    } else {
        let stderr = String::from_utf8(output.stderr)
            .unwrap_or_else(|e| format!("Failed to convert git diff stderr to string: {:?}", e));
        Err(eyre!("Failed to generate git diff: {}", stderr))
    }
}

pub async fn git_apply(path: &Path) -> eyre::Result<()> {
    let output = Command::new("git")
        .arg("apply")
        .arg(path)
        .output()
        .await
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to apply patch")?;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8(output.stderr)
            .unwrap_or_else(|e| format!("Failed to convert git apply stderr to string: {:?}", e));
        Err(eyre!("Failed to apply patch: {}", stderr))
    }
}

pub async fn git_push() -> eyre::Result<()> {
    let output = Command::new("git")
        .arg("push")
        .output()
        .await
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to push changes")?;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8(output.stderr)
            .unwrap_or_else(|e| format!("Failed to convert git push stderr to string: {:?}", e));
        Err(eyre!("Failed to push changes: {}", stderr))
    }
}

pub async fn git_pull() -> eyre::Result<()> {
    let output = Command::new("git")
        .arg("pull")
        .output()
        .await
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to pull changes")?;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8(output.stderr)
            .unwrap_or_else(|e| format!("Failed to convert git pull stderr to string: {:?}", e));
        Err(eyre!("Failed to pull changes: {}", stderr))
    }
}

#[derive(Debug)]
pub enum GitChangeStatus {
    Modified,
    Added,
    Deleted,
    Renamed,
    Copied,
    UpdatedButUnmerged,
    Untracked,
    Unknown(String),
}

impl GitChangeStatus {
    pub fn is_added(&self) -> bool {
        matches!(self, GitChangeStatus::Added)
    }

    pub fn is_modified(&self) -> bool {
        matches!(
            self,
            GitChangeStatus::Modified
                | GitChangeStatus::UpdatedButUnmerged
                | GitChangeStatus::Copied
                | GitChangeStatus::Renamed
        )
    }

    pub fn is_deleted(&self) -> bool {
        matches!(self, GitChangeStatus::Deleted)
    }
}

impl From<&str> for GitChangeStatus {
    fn from(status: &str) -> Self {
        match status {
            "M" => GitChangeStatus::Modified,
            "A" => GitChangeStatus::Added,
            "D" => GitChangeStatus::Deleted,
            "R" => GitChangeStatus::Renamed,
            "C" => GitChangeStatus::Copied,
            "U" => GitChangeStatus::UpdatedButUnmerged,
            "??" => GitChangeStatus::Untracked,
            _ => GitChangeStatus::Unknown(status.to_string()),
        }
    }
}

#[derive(Debug)]
pub struct GitChange {
    pub status: GitChangeStatus,
    pub file: String,
}

pub async fn git_changes() -> eyre::Result<Vec<GitChange>> {
    let output: std::process::Output = Command::new("git")
        .arg("status")
        .arg("--porcelain")
        .output()
        .await
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to get git status")?;

    let output = String::from_utf8(output.stdout)
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to convert git changes to utf8")?;

    let changes = output
        .lines()
        .map(|line| {
            let (status, file) = line
                .trim()
                .split_once(' ')
                .ok_or_else(|| eyre!("Failed to parse git status"))?;

            Ok(GitChange {
                status: status.into(),
                file: file.to_owned(),
            })
        })
        .collect::<eyre::Result<Vec<GitChange>>>()?;

    Ok(changes)
}

/// Returns true if there are any uncommitted changes in the given directory.
pub async fn has_uncommitted_changes(dir: &std::path::Path) -> eyre::Result<bool> {
    let output = Command::new("git")
        .arg("status")
        .arg("--porcelain")
        .current_dir(dir)
        .output()
        .await
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to get git status")?;

    Ok(!output.stdout.is_empty())
}

/// Returns true if there are any unpushed commits in the given directory.
pub async fn has_unpushed_commits(dir: &std::path::Path) -> eyre::Result<bool> {
    let output = Command::new("git")
        .args(["rev-list", "@{u}..HEAD"])
        .current_dir(dir)
        .output()
        .await
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to check for unpushed commits")?;

    Ok(!output.stdout.is_empty())
}

#[derive(Debug)]
pub struct GitInfo {
    pub branch: String,
    pub commit: GitCommit,
    pub origin: String,
    pub changes: Vec<GitChange>,
}

pub async fn git_info() -> eyre::Result<GitInfo> {
    let branch = current_branch().await?;
    let commit = current_commit().await?;
    let origin = current_origin().await?;
    let changes = git_changes().await?;

    Ok(GitInfo {
        branch,
        commit,
        origin,
        changes,
    })
}

#[derive(Debug)]
pub struct GitRepoList {
    map: BTreeMap<Repository, GitInfo>,
}

#[derive(Debug)]
pub enum WorkingBranch {
    None,
    Single(String),
    Multiple(Vec<String>),
}

impl GitRepoList {
    pub async fn new(working_dir: &WorkingDir) -> eyre::Result<Self> {
        let mut map = BTreeMap::new();

        for repository in Repository::iter() {
            let repository_dir = repository.dir()?;

            let git_info = working_dir
                .with_working_dir(&repository_dir, async |_| git_info().await)
                .await?;

            map.insert(repository, git_info);
        }

        Ok(Self { map })
    }

    pub fn get_working_branch(&self) -> WorkingBranch {
        let grouped = self
            .map
            .iter()
            .chunk_by(|(_, git_info)| git_info.branch.clone())
            .into_iter()
            .map(|(branch, i)| (branch, i.collect()))
            .collect::<BTreeMap<String, Vec<(&Repository, &GitInfo)>>>();

        let main_branches = ["main", "master", "develop"];
        let feature_branches = grouped
            .keys()
            .filter(|branch| !main_branches.contains(&branch.as_str()))
            .collect::<Vec<_>>();

        match feature_branches.len() {
            0 => WorkingBranch::None,
            1 => WorkingBranch::Single(feature_branches[0].clone()),
            _ => WorkingBranch::Multiple(feature_branches.into_iter().cloned().collect_vec()),
        }
    }
}
