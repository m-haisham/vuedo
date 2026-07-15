use std::path::Path;

use eyre::{eyre, Context};
use tokio::process::Command;

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
