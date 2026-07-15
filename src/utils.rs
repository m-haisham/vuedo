use eyre::{eyre, WrapErr};

pub async fn which(command: &str) -> eyre::Result<Option<String>> {
    let result = tokio::process::Command::new("which")
        .arg(command)
        .output()
        .await
        .map_err(|e| eyre!(e))
        .wrap_err(format!("Failed to check if `{}` is in the PATH", command))?;

    if result.status.success() {
        let path = String::from_utf8(result.stdout)
            .map_err(|e| eyre!(e))
            .wrap_err("Failed to parse `which` output")?;

        Ok(Some(path))
    } else {
        Ok(None)
    }
}
