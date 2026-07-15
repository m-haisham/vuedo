use clap::{Parser, Subcommand};

use crate::kebab::Kebab;

/// A command-line tool for interacting with the Hummingbird development stack.
///
/// This tool is designed to be used in conjunction with the Hummingbird development stack.
/// It provides a simple interface for starting, stopping, and restarting all projects/containers in the stack.
///
/// The tool is designed to be run globally or within a specific project.
/// When run globally, it will apply the specified command to all projects in the stack.
///
/// You may specify the project to run the command on by providing the project name as the first argument.
/// If no project is specified, the tool will attempt to detect the current project based on the current working directory.
///
/// You can use the `--verbose` flag to increase the verbosity of the output for debugging purposes.
#[derive(Debug, Parser)]
#[clap(version, about)]
pub struct Cli {
    /// Increase verbosity for debugging purposes.
    #[clap(short, long, action = clap::ArgAction::Count)]
    pub verbose: u8,

    /// Run the command in non-interactive mode (dangerous).
    #[clap(short, long)]
    pub non_interactive: bool,

    #[command(subcommand)]
    pub command: Commands,
}

#[derive(Debug, Subcommand)]
pub enum Commands {
    /// Check your configuration for potential issues
    Doctor,
    /// Dump mysql databases
    Dump { key: Kebab },
    /// Restore mysql databases
    Restore { key: Kebab },
    /// Run a command for all projects
    All {
        #[command(subcommand)]
        command: GlobalCommands,
    },
    /// Run a command for traefik project
    Traefik { args: Vec<String> },
    /// Run a command for infra project
    Infra { args: Vec<String> },
    /// Run a command for gateway project
    Gateway { args: Vec<String> },
    /// Run a command for rates project
    Rates { args: Vec<String> },
    /// Run a command for search project
    Search { args: Vec<String> },
    /// Run a command for operations project
    Operations { args: Vec<String> },
    /// Run a command for foundation project
    Foundation { args: Vec<String> },
    /// Run a command for products project
    Products { args: Vec<String> },
    /// Run a command for orders project
    Api { args: Vec<String> },
    /// Run a command for orders project
    App { args: Vec<String> },
    /// Run a command for orders project
    Nest { args: Vec<String> },
    #[command(external_subcommand)]
    Fallthrough(Vec<String>),
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
