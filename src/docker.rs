use bollard::Docker;
use eyre::{eyre, WrapErr};
use std::process::Stdio;
use strum::EnumIter;
use tokio::io::AsyncWriteExt;

use crate::env::get_hbt_docker_root;

#[derive(Debug, EnumIter)]
pub enum Container {
    Traefik,
    Infra,
    Gateway,
    Rates,
    Search,
    Operations,
    Foundation,
    Products,
    ApiGateway,
    App,
    Nest,
}

impl Container {
    pub fn name(&self) -> &str {
        match self {
            Container::Traefik => "hbt-traefik",
            Container::Infra => "hbt-infra",
            Container::Gateway => "hbt-gateway",
            Container::Rates => "hbt-rates",
            Container::Search => "hbt-search",
            Container::Operations => "hbt-operations",
            Container::Foundation => "hbt-foundation",
            Container::Products => "hbt-products",
            Container::ApiGateway => "hbt-apigateway",
            Container::App => "hbt-app",
            Container::Nest => "hbt-nest",
        }
    }

    pub fn compose_file(&self) -> eyre::Result<String> {
        let hbt_docker_root = get_hbt_docker_root()?;
        let compose_file = hbt_docker_root.join(self.name()).join("docker-compose.yml");

        compose_file
            .to_str()
            .ok_or_else(|| eyre!("Failed to convert compose file path to string"))
            .map(String::from)
    }
}

pub async fn ping_docker() -> eyre::Result<()> {
    let docker = Docker::connect_with_local_defaults()?;
    docker.ping().await?;
    Ok(())
}

pub async fn mysql_dump(
    compose_file: &str,
    database: &str,
    password: &str,
) -> eyre::Result<String> {
    let password = format!("-p{}", password);

    let mut cmd = tokio::process::Command::new("docker-compose");
    cmd.args(["-f", compose_file]);
    cmd.args(["exec", "hbt-service-mysql", "mysqldump"]);
    cmd.args(["--skip-lock-tables"]);
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

pub async fn mysql_restore(
    compose_file: &str,
    database: &str,
    password: &str,
    dump: &[u8],
) -> eyre::Result<()> {
    let password = format!("-p{}", password);

    let mut cmd = tokio::process::Command::new("docker-compose");
    cmd.args(["-f", compose_file]);
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

pub async fn compose_up(compose_file: &str, args: &[String]) -> eyre::Result<()> {
    let mut cmd = tokio::process::Command::new("docker-compose");
    cmd.args(["-f", compose_file]);
    cmd.args(["up", "-d"]);
    cmd.args(args);

    cmd.status()
        .await
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to run docker-compose up")?;

    Ok(())
}

pub async fn compose_down(compose_file: &str, args: &[String]) -> eyre::Result<()> {
    let mut cmd = tokio::process::Command::new("docker-compose");
    cmd.args(["-f", compose_file]);
    cmd.args(["down"]);
    cmd.args(args);

    cmd.status()
        .await
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to run docker-compose down")?;

    Ok(())
}

pub async fn compose_exec(compose_file: &str, args: &[&str]) -> eyre::Result<()> {
    let mut cmd = tokio::process::Command::new("docker-compose");
    cmd.args(["-f", compose_file]);
    cmd.args(["exec"]);
    cmd.args(args);

    cmd.status()
        .await
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to run docker-compose exec")?;

    Ok(())
}
