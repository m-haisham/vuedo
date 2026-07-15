use std::{
    fs::File,
    io::{BufReader, BufWriter},
};

use dialoguer::{theme::ColorfulTheme, Confirm};
use eyre::{eyre, WrapErr};

use crate::{
    compress, context::AppContext, db, env::get_hbt_root, infra::set_current_infra, kebab::Kebab,
};

#[tracing::instrument(
    skip_all,
    fields(
        key = key.as_ref(),
    )
)]
pub async fn dump_all_project_dbs(context: AppContext, key: Kebab) -> eyre::Result<()> {
    set_current_infra()?;

    let dump_dir = get_hbt_root()?.join("dumps").join(key.as_ref());
    if dump_dir.exists() {
        if context.non_interactive {
            let confirm = Confirm::with_theme(&ColorfulTheme::default())
                .with_prompt(format!(
                    "Dump directory {} already exists. Overwrite?",
                    dump_dir.display()
                ))
                .interact()
                .map_err(|e| eyre!(e))
                .wrap_err("Failed to prompt for confirmation")?;

            if !confirm {
                eyre::bail!("User declined to overwrite dump directory");
            }
        }

        tracing::info!("Removing existing dump directory...");

        std::fs::remove_dir_all(&dump_dir)
            .map_err(|e| eyre!(e))
            .wrap_err("Failed to remove existing dump directory")?;
    }

    std::fs::create_dir_all(&dump_dir)
        .map_err(|e| eyre!(e))
        .wrap_err("Failed to create dump directory")?;

    let configured_dbs = db::get_configured_dbs().await?;

    for project_db in configured_dbs {
        if let Err(e) = db::dump_project(&project_db, &dump_dir).await {
            tracing::error!("{}", e);
        }
    }

    tracing::info!("Dumps written to {}", dump_dir.display());

    let dump_zip_path = get_hbt_root()?
        .join("dumps")
        .join(format!("{}.zip", key.as_ref()));

    let dump_zip_file = BufWriter::new(
        File::create(&dump_zip_path)
            .map_err(|e| eyre!(e))
            .wrap_err("Failed to create zip file")?,
    );

    compress::zip_dir(dump_zip_file, &dump_dir).await?;

    tracing::info!("Zipped dumps to {}", dump_zip_path.display());

    Ok(())
}

#[tracing::instrument(
    skip_all,
    fields(
        key = key.as_ref(),
    )
)]
pub async fn restore_all_project_dbs(context: AppContext, key: Kebab) -> eyre::Result<()> {
    let dump_zip_path = get_hbt_root()?
        .join("dumps")
        .join(format!("{}.zip", key.as_ref()));

    let dump_unzip_dir = get_hbt_root()?.join("dumps").join(key.as_ref());

    if dump_zip_path.exists() {
        let dump_zip_file = File::open(&dump_zip_path)
            .map_err(|e| eyre!(e))
            .wrap_err("Failed to open zip file")?;

        let dump_zip_file = BufReader::new(dump_zip_file);

        compress::unzip_dir(dump_zip_file, &dump_unzip_dir).await?;

        tracing::info!("Unzipped dumps to {}", dump_unzip_dir.display());
    } else if dump_unzip_dir.exists() {
        tracing::info!("No dump zip file found at {}", dump_zip_path.display());
    }

    if !dump_unzip_dir.exists() {
        tracing::info!("No dumps found to restore");
        return Ok(());
    }

    if !dump_unzip_dir.is_dir() {
        eyre::bail!("Dump directory found but is not a directory");
    }

    let configured_dbs = db::get_configured_dbs().await?;

    for project_db in configured_dbs {
        tracing::info!("Restoring dump for {}", project_db.project.name());

        let dump_file = dump_unzip_dir.join(format!("{}.sql.gz", project_db.db_database));

        if !dump_file.exists() {
            tracing::debug!(
                "No dump file found for {} ({})",
                project_db.project.name(),
                project_db.db_database,
            );
            continue;
        }

        if !dump_file.is_file() {
            tracing::warn!("Skipping non-file dump for {}", project_db.project.name());
            continue;
        }

        if !context.non_interactive {
            let confirm = Confirm::with_theme(&ColorfulTheme::default())
                .with_prompt(format!(
                    "Restore dump for {} to {}?",
                    project_db.project.name(),
                    project_db.db_database
                ))
                .interact()
                .map_err(|e| eyre!(e))
                .wrap_err("Failed to prompt for confirmation")?;

            if !confirm {
                continue;
            }
        }

        db::restore(&project_db, &dump_file).await?;
    }

    Ok(())
}
