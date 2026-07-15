use eyre::{eyre, WrapErr};
use std::process::Stdio;
use tokio::io::AsyncWriteExt;

use crate::env::get_hbt_docker_root;

pub async fn mysql_dump(database: &str, password: &str) -> eyre::Result<String> {
    let password = format!("-p{}", password);

    let mut cmd = tokio::process::Command::new("docker-compose");
    cmd.args(["exec", "hbt-service-mysql", "mysqldump"]);
    cmd.args(["-u", "root"]);
    cmd.args([&password]);
    cmd.args([database]);

    let output = cmd.output().await?;

    if output.status.success() {
        Ok(String::from_utf8(output.stdout)?)
    } else {
        let stderr = String::from_utf8(output.stderr)
            .unwrap_or_else(|e| format!("Failed to convert stderr to string: {:?}", e));

        Err(eyre!("Failed to run mysqldump: {}", stderr))
    }
}

pub async fn mysql_restore(database: &str, password: &str, dump: &[u8]) -> eyre::Result<()> {
    let password = format!("-p{}", password);

    let mut cmd = tokio::process::Command::new("docker-compose");
    cmd.args(["exec", "-T", "hbt-service-mysql", "mysql"]);
    cmd.args(["-u", "root"]);
    cmd.args([&password]);
    cmd.args([database]);
    cmd.stdin(Stdio::piped());

    let mut child = cmd.spawn().wrap_err("Failed to spawn mysql")?;

    let child_stdin = child
        .stdin
        .as_mut()
        .ok_or_else(|| eyre!("Failed to open stdin"))?;

    child_stdin.write_all(dump).await?;

    let status = child.wait().await?;

    if status.success() {
        Ok(())
    } else {
        Err(eyre!("Failed to run mysql: {}", status))
    }
}

pub async fn mysql_check_connect(database: &str, password: &str) -> eyre::Result<()> {
    let password = format!("-p{}", password);

    let hbt_docker_root = get_hbt_docker_root()?;
    let compose_config_file = hbt_docker_root.join("hbt-infra").join("docker-compose.yml");
    let Some(compose_config_path) = compose_config_file.to_str() else {
        return Err(eyre!("Failed to convert compose path to string"));
    };

    let mut cmd = tokio::process::Command::new("docker-compose");
    cmd.args(["-f", compose_config_path]);
    cmd.args(["exec", "hbt-service-mysql", "mysql"]);
    cmd.args(["-u", "root"]);
    cmd.args([&password]);
    cmd.args(["-D", database]);
    cmd.args(["-e", "SELECT 1"]);

    let output = cmd.output().await?;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8(output.stderr)
            .unwrap_or_else(|e| format!("Failed to convert stderr to string: {:?}", e));

        Err(eyre!("Failed to run mysql: {}", stderr))
    }
}

pub async fn compose_up(args: &[String]) -> eyre::Result<()> {
    let mut cmd = tokio::process::Command::new("docker-compose");
    cmd.args(["up", "-d"]);
    cmd.args(args);

    cmd.status()
        .await
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to run docker-compose up")?;

    Ok(())
}

pub async fn compose_down(args: &[String]) -> eyre::Result<()> {
    let mut cmd = tokio::process::Command::new("docker-compose");
    cmd.args(["down"]);
    cmd.args(args);

    cmd.status()
        .await
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to run docker-compose down")?;

    Ok(())
}

pub async fn compose_exec(args: &[&str]) -> eyre::Result<()> {
    let mut cmd = tokio::process::Command::new("docker-compose");
    cmd.args(["exec"]);
    cmd.args(args);

    cmd.status()
        .await
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to run docker-compose exec")?;

    Ok(())
}
