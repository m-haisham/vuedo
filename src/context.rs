use std::path::PathBuf;

use config::Config;

#[derive(Debug)]
pub struct AppContext {
    pub config: Config,
    pub working_dir: WorkingDir,
}

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
        std::env::set_current_dir(&path)?;
        self.path = path;
        Ok(())
    }

    pub fn get_path(&self) -> &PathBuf {
        &self.path
    }
}
