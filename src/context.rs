use crate::config::{read_config, Config};
use std::path::PathBuf;

#[derive(Debug)]
pub struct AppContext {
    pub config: Config,
    pub working_dir: WorkingDir,
}

impl AppContext {
    pub fn new() -> eyre::Result<Self> {
        let config = read_config()?;
        let working_dir = WorkingDir::new()?;
        Ok(Self {
            config,
            working_dir,
        })
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

        std::env::set_current_dir(&path)?;
        self.path = path;

        Ok(())
    }

    pub fn get_path(&self) -> &PathBuf {
        &self.path
    }
}
