use std::path::PathBuf;

#[derive(Debug)]
pub struct Storage {
    dir: PathBuf,
    provider: StorageProvider,
}

#[derive(Debug)]
pub enum StorageProvider {
    Local,
}

impl Storage {
    pub fn new(dir: PathBuf) -> Self {
        Self {
            dir,
            provider: StorageProvider::Local,
        }
    }
}
