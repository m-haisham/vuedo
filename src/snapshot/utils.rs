use eyre::{eyre, Context};
use hex::ToHex;
use sha2::Digest;
use std::{
    io::Read,
    path::{Path, PathBuf},
};

use crate::git::Repository;

use super::REPOSITORY_FILES_DIR;

pub fn hash_as_hex<R: Read>(reader: &mut R) -> eyre::Result<String> {
    use sha2::Sha256;

    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 4096];

    loop {
        let read = reader
            .read(&mut buffer)
            .map_err(|e| eyre!(e))
            .wrap_err("Failed to read from file")?;

        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }

    Ok(hasher.finalize().encode_hex())
}

pub fn get_pack_repository_file_path(
    repository: Repository,
    relative_path: &Path,
) -> eyre::Result<PathBuf> {
    let key = format!("{}::{}", repository.dir_name(), relative_path.display());
    let hash = hash_as_hex(&mut key.as_bytes())?;
    let file_name = format!("{}.pack", hash);
    let path = Path::new(REPOSITORY_FILES_DIR).join(file_name);
    Ok(path)
}

pub fn get_pack_repository_random_file_path(repository: Repository) -> eyre::Result<PathBuf> {
    let random = rand::random::<u64>();
    let key = format!("{}::{}", repository.dir_name(), random);
    let hash = hash_as_hex(&mut key.as_bytes())?;
    let file_name = format!("{}.pack", hash);
    let path = Path::new(REPOSITORY_FILES_DIR).join(file_name);
    Ok(path)
}
