use config::builder::DefaultState;
use eyre::{eyre, Context};
use serde::{Deserialize, Serialize};

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct Config {
    #[serde(default)]
    profile: ProfileConfig,
}

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct ProfileConfig {
    #[serde(default)]
    username: Option<Username>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Username(String);

impl TryFrom<String> for Username {
    type Error = eyre::Report;

    fn try_from(value: String) -> Result<Self, Self::Error> {
        if value.is_empty() {
            return Err(eyre!("Username cannot be empty"));
        }

        if value.len() > 32 {
            return Err(eyre!("Username cannot be longer than 32 characters"));
        }

        if !is_kebab(&value) {
            return Err(eyre!("Username must be in kebab-case"));
        }

        Ok(Self(value))
    }
}

fn is_kebab(name: &str) -> bool {
    if name.starts_with('-') || name.ends_with('-') {
        return false;
    }

    if name.contains("--") {
        return false;
    }

    name.chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

#[tracing::instrument(skip_all)]
pub fn read_config() -> eyre::Result<Config> {
    let config_dir = dirs::config_dir()
        .ok_or_else(|| eyre!("Could not find config directory"))?
        .join(env!("CARGO_PKG_NAME"));

    let config_path = config_dir.join("config.toml");
    if !config_path.exists() {
        return Ok(Config::default());
    }

    let config = config::ConfigBuilder::<DefaultState>::default()
        .add_source(config::File::from(config_path))
        .build()
        .map_err(|e| eyre!(e))
        .wrap_err("Could not build config")?;

    let config = config
        .try_deserialize()
        .map_err(|e| eyre!(e))
        .wrap_err("Could not deserialize config")?;

    Ok(config)
}
