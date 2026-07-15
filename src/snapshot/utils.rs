use eyre::{eyre, Context};
use hex::ToHex;
use sha2::Digest;
use std::{
    fs::File,
    io::{BufReader, Read},
};

pub async fn hash_file_as_hex(file: File) -> eyre::Result<String> {
    use sha2::Sha256;

    let mut reader = BufReader::new(file);
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
