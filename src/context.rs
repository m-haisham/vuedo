use console::Term;
use directories::ProjectDirs;
use eyre::{eyre, Context};

use crate::config::{read_config, Config};
use std::{fs::create_dir_all, path::PathBuf};

#[derive(Debug)]
pub struct AppContext {
    pub name: String,
    pub verbose: u8,
    pub non_interactive: bool,
    pub config: Config,
    pub working_dir: WorkingDir,
    pub term: Term,
}

impl AppContext {
    pub fn new(verbose: u8, non_interactive: bool) -> eyre::Result<Self> {
        let name = env!("CARGO_PKG_NAME").to_string();
        let config = read_config()?;
        let working_dir = WorkingDir::new()?;
        let term = Term::stdout();
        Ok(Self {
            name,
            verbose,
            non_interactive,
            config,
            working_dir,
            term,
        })
    }

    pub fn dirs(&self) -> eyre::Result<ProjectDirs> {
        project_dirs(&self.name)
    }

    pub fn data_dir(&self) -> eyre::Result<PathBuf> {
        let dirs = self.dirs()?;
        create_dir_all(dirs.data_dir())
            .map_err(|e| eyre!(e))
            .wrap_err("Failed to create data directory");
        Ok(dirs.data_dir().to_path_buf())
    }
}

fn project_dirs(name: &str) -> eyre::Result<ProjectDirs> {
    directories::ProjectDirs::from("travel", "hummingbird", name)
        .ok_or_else(|| eyre!("Failed to retreive application directory"))
}

/// Represents the current working directory
///
/// This struct assumes that the current working directory
/// is only changed using change_dir() method and not by
/// any other means.
///
/// This struct is needed to keep track of the current working directory
/// in a more visible way. Using `std::env::current_dir()` directly
/// makes it hard to track the current working directory and when it
/// might have been changed.
#[derive(Debug)]
pub struct WorkingDir {
    path: PathBuf,
}

impl WorkingDir {
    pub fn new() -> eyre::Result<Self> {
        let path = std::env::current_dir()?;
        Ok(Self { path })
    }

    pub fn change_dir(&mut self, path: PathBuf) -> eyre::Result<()> {
        if self.path == path {
            return Ok(());
        }

        std::env::set_current_dir(&path)
            .map_err(|e| eyre!(e))
            .wrap_err_with(|| format!("Failed to change directory to: {}", path.display()))?;

        self.path = path;

        Ok(())
    }

    pub fn get_path(&self) -> &PathBuf {
        &self.path
    }
}
