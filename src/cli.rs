use clap::{Parser, Subcommand};

#[derive(Debug, Parser)]
pub struct Cli {
    #[command(subcommand)]
    pub command: Commands,
}

#[derive(Debug, Subcommand)]
pub enum Commands {
    Up {
        rest: Vec<String>,
    },
    Down {
        rest: Vec<String>,
    },
    #[command(external_subcommand)]
    Project(Vec<String>),
}
