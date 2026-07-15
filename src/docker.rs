use eyre::{eyre, WrapErr};

pub async fn compose_up(args: &[String]) -> eyre::Result<()> {
    let mut cmd = tokio::process::Command::new("docker-compose");
    cmd.args(&["up", "-d"]);
    cmd.args(args);

    cmd.status()
        .await
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to run docker-compose up")?;

    Ok(())
}

pub async fn compose_down(args: &[String]) -> eyre::Result<()> {
    let mut cmd = tokio::process::Command::new("docker-compose");
    cmd.args(&["down"]);
    cmd.args(args);

    cmd.status()
        .await
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to run docker-compose down")?;

    Ok(())
}
