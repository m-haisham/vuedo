mod project;

use std::{
    fs::{File, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
};

use crate::env::{get_hbt_docker_root, get_hbt_root, EnvError};
use dialoguer::Input;
use eyre::{eyre, Context};
use project::setup_projects;

const DOT_ALIASES: &str = "~/.Aliases";

#[tracing::instrument]
pub async fn setup(non_interactive: bool) -> eyre::Result<()> {
    let hbt_root = valid_path_env(get_hbt_root())?.ok();
    let hbt_docker_root = valid_path_env(get_hbt_docker_root())?.ok();

    if hbt_root.is_none() || hbt_docker_root.is_none() {
        setup_env_vars(hbt_root, hbt_docker_root).await?;
    } else {
        tracing::info!(
            "Skipping environment setup as HBT_ROOT and HBT_DOCKER_ROOT are already set"
        );
    }

    setup_projects(non_interactive).await?;

    Ok(())
}

fn valid_path_env(result: Result<PathBuf, EnvError>) -> eyre::Result<eyre::Result<PathBuf>> {
    match result {
        Ok(path) => Ok(Ok(path)),
        Err(e) => match e {
            EnvError::NotSet { e, key: _ } => Ok(Err(e)),
            EnvError::NotDirectory { key } => {
                Err(eyre!("{} is set but is not a valid directory", key))
            }
        },
    }
}

async fn setup_env_vars(
    hbt_root: Option<PathBuf>,
    hbt_docker_root: Option<PathBuf>,
) -> eyre::Result<()> {
    let dotaliases = PathBuf::from(DOT_ALIASES);
    if !dotaliases.exists() {
        tracing::info!("Creating ~/.Aliases file");
        File::create(&dotaliases)?;
    }

    if !is_aliases_sourced().await? {
        tracing::info!("Sourcing ~/.Aliases");
        source_aliases().await?;
    }

    match hbt_root {
        Some(path) => {
            tracing::info!("HBT_ROOT is set to {:?}", path);
            path
        }
        None => {
            set_alias_prompt(
                &dotaliases,
                "HBT_ROOT",
                "Enter the path to the HBT root",
                String::from("."),
            )
            .await?
        }
    };

    match hbt_docker_root {
        Some(path) => {
            tracing::info!("HBT_DOCKER_ROOT is set to {:?}", path);
            path
        }
        None => {
            set_alias_prompt(
                &dotaliases,
                "HBT_DOCKER_ROOT",
                "Enter the path to the HBT Docker root",
                String::from("$HBT_ROOT/hbt-docker-dev-environment"),
            )
            .await?
        }
    };

    Ok(())
}

async fn is_aliases_sourced() -> eyre::Result<bool> {
    let dotzshrc = PathBuf::from("~/.zshrc");
    let dotbashrc = PathBuf::from("~/.bashrc");
    let alias_pattern = regex::Regex::new(r"source\s+.*\.Aliases")?;

    if dotzshrc.exists() {
        let content = std::fs::read_to_string(&dotzshrc)?;
        Ok(alias_pattern.is_match(&content))
    } else if dotbashrc.exists() {
        let content = std::fs::read_to_string(&dotbashrc)?;
        Ok(alias_pattern.is_match(&content))
    } else {
        Ok(false)
    }
}

async fn source_aliases() -> eyre::Result<()> {
    let dotaliases = PathBuf::from(DOT_ALIASES);
    let dotzshrc = PathBuf::from("~/.zshrc");
    let dotbashrc = PathBuf::from("~/.bashrc");

    if dotzshrc.exists() {
        append_to_file(&dotzshrc, &format!("source {}", dotaliases.display())).await?;
    } else if dotbashrc.exists() {
        append_to_file(&dotbashrc, &format!("source {}", dotaliases.display())).await?;
    } else {
        return Err(eyre!(
            "Neither ~/.zshrc nor ~/.bashrc found. Please source ~/.Aliases manually before continuing"
        ));
    }

    Ok(())
}

async fn set_alias_prompt(
    dotaliases: &Path,
    key: &str,
    prompt: &str,
    default_value: String,
) -> eyre::Result<PathBuf> {
    let input_hbt_root: String = Input::new()
        .with_prompt(prompt)
        .default(default_value)
        .interact_text()
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to get input")?;

    let path = PathBuf::from(input_hbt_root);
    if path.exists() && path.is_file() {
        return Err(eyre!("The path is a file, not a directory"));
    }

    tracing::info!("Setting {key} to {:?}", path);
    std::env::set_var(key, &path);
    append_to_file(&dotaliases, &format!("export {key}={}", path.display())).await?;

    Ok(path)
}

async fn append_to_file(file_path: &Path, line: &str) -> eyre::Result<()> {
    let mut file = OpenOptions::new()
        .write(true)
        .append(true)
        .open(&file_path)
        .map_err(|e| eyre!(e))
        .wrap_err_with(|| format!("Failed to open file: {}", file_path.display()))?;

    file.write_all(line.as_bytes())
        .map_err(|e| eyre!(e))
        .wrap_err_with(|| format!("Failed to write to file: {}", file_path.display()))?;

    Ok(())
}
