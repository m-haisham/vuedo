use console::Term;

use crate::config::{read_config, Config};
use std::path::PathBuf;

#[derive(Debug)]
pub struct AppContext {
    pub verbose: u8,
    pub non_interactive: bool,
    pub config: Config,
    pub working_dir: WorkingDir,
    pub term: Term,
}

impl AppContext {
    pub fn new(verbose: u8, non_interactive: bool) -> eyre::Result<Self> {
        let config = read_config()?;
        let working_dir = WorkingDir::new()?;
        let term = Term::stdout();
        Ok(Self {
            verbose,
            non_interactive,
            config,
            working_dir,
            term,
        })
    }

    pub fn is_verbose(&self) -> bool {
        self.verbose > 0
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
