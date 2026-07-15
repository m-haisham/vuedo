use clap::{Parser, Subcommand};

#[derive(Debug, Parser)]
pub struct Cli {
    /// Increase verbosity for debugging purposes.
    #[clap(short, long, action = clap::ArgAction::Count)]
    pub verbose: u8,

    #[command(subcommand)]
    pub command: Commands,
}

#[derive(Debug, Subcommand)]
pub enum Commands {
    /// Run a command for all projects
    Global {
        #[command(subcommand)]
        command: GlobalCommands,
    },
    #[command(external_subcommand)]
    Project(Vec<String>),
}

#[derive(Debug, Subcommand)]
pub enum GlobalCommands {
    /// Start all projects
    Up { rest: Vec<String> },
    /// Stop all projects
    Down { rest: Vec<String> },
    /// Restart all projects
    Restart { rest: Vec<String> },
}
