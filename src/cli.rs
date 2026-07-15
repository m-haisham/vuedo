use clap::{Parser, Subcommand};
use std::path::PathBuf;

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
    /// Run a command for traefik
    Traefik {
        #[command(subcommand)]
        command: ProjectCommands,
    },
    /// Run a command for infra
    Infra {
        #[command(subcommand)]
        command: ProjectCommands,
    },
    /// Run a command for gateway
    Gateway {
        #[command(subcommand)]
        command: ProjectCommands,
    },
    /// Run a command for rates
    Rates {
        #[command(subcommand)]
        command: ProjectCommands,
    },
    /// Run a command for search
    Search {
        #[command(subcommand)]
        command: ProjectCommands,
    },
    /// Run a command for operations
    Operations {
        #[command(subcommand)]
        command: ProjectCommands,
    },
    /// Run a command for foundation
    Foundation {
        #[command(subcommand)]
        command: ProjectCommands,
    },
    /// Run a command for products
    Products {
        #[command(subcommand)]
        command: ProjectCommands,
    },
    /// Run a command for api
    Api {
        #[command(subcommand)]
        command: ProjectCommands,
    },
    /// Run a command for app
    App {
        #[command(subcommand)]
        command: ProjectCommands,
    },
    /// Run a command for nest
    Nest {
        #[command(subcommand)]
        command: ProjectCommands,
    },
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

#[derive(Debug, Parser)]
pub enum ProjectCommands {
    /// Start the project
    Up { rest: Vec<String> },
    /// Stop the project
    Down { rest: Vec<String> },
    /// Restart the project
    Restart { rest: Vec<String> },
    /// Start an interactive shell in the project
    Shell { rest: Vec<String> },
    /// Alias for node in the project
    Node { rest: Vec<String> },
    /// Alias for npm in the project
    Npm { rest: Vec<String> },
    /// Alias for yarn in the project
    Yarn { rest: Vec<String> },
    /// Alias for php in the project
    Php { rest: Vec<String> },
    /// Alias for artisan in the project
    Artisan { rest: Vec<String> },
    /// Alias for composer in the project
    Composer { rest: Vec<String> },
    /// Alias for phpunit in the project
    Phpunit { rest: Vec<String> },
    /// Dump the database
    Dump {
        /// A unique key to identify the dump
        key: Option<Kebab>,
    },
    /// Restore from a dump
    Restore {
        /// The path to the dump file
        path: PathBuf,
    },
}
