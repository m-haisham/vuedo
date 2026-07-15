use eyre::{eyre, WrapErr};
use std::{
    fs::{create_dir_all, DirEntry, File, OpenOptions},
    io::{BufReader, BufWriter, Read, Write},
    path::Path,
};

fn is_hidden(entry: &DirEntry) -> bool {
    entry
        .file_name()
        .to_str()
        .map(|s| s.starts_with("."))
        .unwrap_or(false)
}

pub async fn zip_dir(zip_file: BufWriter<File>, dir: &Path) -> eyre::Result<BufWriter<File>> {
    let mut zip = zip::ZipWriter::new(zip_file);
    let options =
        zip::write::FileOptions::<()>::default().compression_method(zip::CompressionMethod::Stored);

    let read_dir = std::fs::read_dir(dir)
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to read directory")?;

    let mut buffer = Vec::new();

    for entry in read_dir {
        let entry = entry
            .map_err(|e| eyre!(e))
            .wrap_err("Failed to read directory entry")?;

        if is_hidden(&entry) {
            continue;
        }

        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        let Some(name) = path.file_name() else {
            continue;
        };

        let Some(name) = name.to_str() else {
            tracing::warn!("Failed to convert file name to string: {:?}", name);
            continue;
        };

        zip.start_file(name, options)
            .map_err(|e| eyre!(e))
            .wrap_err_with(|| format!("Failed to start zip file: {:?}", name))?;

        let file = File::open(&path)
            .map_err(|e| eyre!(e))
            .wrap_err_with(|| format!("Failed to open file for reading: {}", path.display()))?;

        let mut file = BufReader::new(file);
        file.read_to_end(&mut buffer)?;
        zip.write_all(&buffer)?;
        buffer.clear();
    }

    let zip_file = zip
        .finish()
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to finish zip file")?;

    Ok(zip_file)
}

pub async fn unzip_dir(zip_file: BufReader<File>, dir: &Path) -> eyre::Result<()> {
    let mut zip = zip::ZipArchive::new(zip_file)
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to read zip file")?;

    if !dir.exists() {
        create_dir_all(dir)
            .map_err(|e| eyre!(e))
            .wrap_err_with(|| format!("Failed to create directory: {}", dir.display()))?;
    }

    for i in 0..zip.len() {
        let mut zip_file = zip
            .by_index(i)
            .map_err(|e| eyre!(e))
            .wrap_err_with(|| format!("Failed to read file at index: {}", i))?;

        let file_name = zip_file.name();
        let file_path = dir.join(file_name);

        if zip_file.is_file() {
            let file = OpenOptions::new()
                .write(true)
                .create(true)
                .open(&file_path)
                .map_err(|e| eyre!(e))
                .wrap_err_with(|| {
                    format!("Failed to open file for writing: {}", file_path.display())
                })?;

            let mut file = BufWriter::new(file);
            std::io::copy(&mut zip_file, &mut file)
                .map_err(|e| eyre!(e))
                .wrap_err_with(|| format!("Failed to write file: {}", file_path.display()))?;

            tracing::info!("Unzipped file: {}", file_path.display());
        } else {
            tracing::warn!("Ignoring directory: {}", file_path.display());
        }
    }

    Ok(())
}

pub async fn gzip(content: &str) -> eyre::Result<Vec<u8>> {
    let mut encoder = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
    encoder.write_all(content.as_bytes())?;

    let bytes = encoder
        .finish()
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to finish gzip encoding")?;

    Ok(bytes)
}

pub async fn gunzip(bytes: &[u8]) -> eyre::Result<String> {
    let mut decoder = flate2::read::GzDecoder::new(bytes);
    let mut content = String::new();
    decoder.read_to_string(&mut content)?;

    Ok(content)
}
