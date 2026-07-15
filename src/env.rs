use config::{builder::DefaultState, Environment};
use eyre::{eyre, WrapErr};
use serde::de::DeserializeOwned;
use std::path::{Path, PathBuf};

#[tracing::instrument(skip_all)]
pub fn read_env<T>(path: &Path) -> eyre::Result<T>
where
    T: DeserializeOwned,
{
    let env_keys = dotenvy::from_path_iter(path)
        .map_err(|e| eyre!(e))
        .wrap_err("Could not read env file")?
        .collect::<Result<std::collections::HashMap<String, String>, _>>()
        .map_err(|e| eyre!(e))
        .wrap_err("Could not parse env file")?;

    let source = Environment::default().source(Some(env_keys));

    let env_config = config::ConfigBuilder::<DefaultState>::default()
        .add_source(source)
        .build()
        .map_err(|e| eyre!(e))
        .wrap_err("Could not build environment")?;

    let env = env_config
        .try_deserialize()
        .map_err(|e| eyre!(e))
        .wrap_err("Could not deserialize environment")?;

    Ok(env)
}

#[derive(Debug, thiserror::Error)]
pub enum EnvError {
    #[error("{key} not set: {e}")]
    NotSet {
        #[source]
        e: eyre::Report,
        key: String,
    },
    #[error("{key} is not a valid directory")]
    NotDirectory { key: String },
}

pub fn get_hbt_root() -> Result<PathBuf, EnvError> {
    let hbt_root = std::env::var("HBT_ROOT")
        .map_err(|e| eyre!(e))
        .map_err(|e| EnvError::NotSet {
            e,
            key: "HBT_ROOT".to_string(),
        })?;

    let hbt_root = PathBuf::from(hbt_root);

    if hbt_root.exists() && hbt_root.is_dir() {
        Ok(hbt_root)
    } else {
        Err(EnvError::NotDirectory {
            key: "HBT_ROOT".to_string(),
        })
    }
}

pub fn get_hbt_docker_root() -> Result<PathBuf, EnvError> {
    let hbt_docker_root = std::env::var("HBT_DOCKER_ROOT")
        .map_err(|e| eyre!(e))
        .map_err(|e| EnvError::NotSet {
            e,
            key: "HBT_DOCKER_ROOT".to_string(),
        })?;

    let hbt_docker_root = PathBuf::from(hbt_docker_root);

    if hbt_docker_root.exists() && hbt_docker_root.is_dir() {
        Ok(hbt_docker_root)
    } else {
        Err(EnvError::NotDirectory {
            key: "HBT_DOCKER_ROOT".to_string(),
        })
    }
}
