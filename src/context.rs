use console::Term;
use directories::ProjectDirs;
use eyre::{eyre, Context};

use crate::{
    config::{read_config, Config},
    storage::Storage,
};
use std::path::PathBuf;

#[derive(Debug)]
pub struct AppContext {
    pub name: String,
    pub verbose: u8,
    pub non_interactive: bool,
    pub config: Config,
    pub working_dir: WorkingDir,
    pub term: Term,
    pub storage: Storage,
}

impl AppContext {
    pub fn new(verbose: u8, non_interactive: bool) -> eyre::Result<Self> {
        let config = read_config()?;
        let working_dir = WorkingDir::new()?;
        let term = Term::stdout();
        let storage = Storage::local()?;
        Ok(Self {
            name: env!("CARGO_PKG_NAME").to_string(),
            verbose,
            non_interactive,
            config,
            working_dir,
            term,
            storage,
        })
    }

    pub fn dirs(&self) -> eyre::Result<ProjectDirs> {
        directories::ProjectDirs::from("travel", "hummingbird", &self.name)
            .ok_or_else(|| eyre!("Failed to retreive application directory"))
    }
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
