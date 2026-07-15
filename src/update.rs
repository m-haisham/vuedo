use axoupdater::{AxoUpdater, AxoupdateError};
use eyre::{eyre, Context};

#[allow(unused)] // This function is not used in debug builds
pub async fn update_prompt(non_interactive: bool) -> eyre::Result<()> {
    let mut updater = AxoUpdater::new_for(env!("CARGO_PKG_NAME"));
    if let Some(token) = option_env!("HBT_GITHUB_TOKEN") {
        if !token.is_empty() {
            updater.set_github_token(token);
        }
    }

    let load_receipt_result = updater.load_receipt();
    if let Err(AxoupdateError::NoReceipt { app_name }) = load_receipt_result {
        tracing::warn!("No version receipt found for {}", app_name);
        return Ok(());
    }

    let update_needed = updater
        .is_update_needed()
        .await
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to check for updates")?;

    if !update_needed {
        tracing::info!("No updates available");
        return Ok(());
    }

    if !non_interactive {
        let update = dialoguer::Confirm::new()
            .with_prompt("An update is available. Do you want to update?")
            .interact()?;

        if !update {
            return Ok(());
        }
    }

    updater
        .run()
        .await
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to update")?;

    Ok(())
}
