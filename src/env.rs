use config::{builder::DefaultState, Environment};
use eyre::{eyre, WrapErr};
use serde::de::DeserializeOwned;
use std::path::Path;

#[tracing::instrument(skip_all)]
pub async fn read_env<T>(path: &Path) -> eyre::Result<T>
where
    T: DeserializeOwned,
{
    let env_keys = dotenvy::from_path_iter(path)
        .map_err(|e| eyre!(e))
        .wrap_err("Could not read env file")?
        .into_iter()
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
