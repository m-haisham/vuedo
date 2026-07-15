use clap::{Parser, Subcommand};
use std::path::PathBuf;

use crate::{git::Repository, kebab::Kebab};

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
    #[arg(short, long, action = clap::ArgAction::Count)]
    pub verbose: u8,

    /// Run the command in non-interactive mode (dangerous).
    #[arg(short, long)]
    pub non_interactive: bool,

    #[command(subcommand)]
    pub command: Commands,
}

#[derive(Debug, Subcommand)]
pub enum Commands {
    /// Start the development environment and check for potential issues
    Start,
    /// Stop the development environment and check for potential issues
    Stop,
    /// Check your configuration for potential issues
    Doctor,
    /// Dump mysql databases
    Dump { key: Kebab },
    /// Restore mysql databases
    Restore { key: Kebab },
    /// Set up the development environment
    Setup,
    /// List current branches across all projects
    Branch,
    /// Checkout a branch across all projects
    Checkout {
        /// The branch to check out, defaults to branch in current project
        #[arg(short, long)]
        branch: Option<String>,

        /// Migrate the database after checking out the branch
        #[arg(short, long)]
        migrate: bool,
    },
    /// Run a command for all projects
    All {
        #[command(subcommand)]
        command: GlobalCommands,
    },
    /// Snapshot related commands
    Snapshot {
        #[command(subcommand)]
        command: SnapshotCommands,
    },
    /// Run redis commands
    Redis {
        #[arg(allow_hyphen_values = true, hide = true)]
        rest: Vec<String>,
    },
    /// Set or get a configuration value
    ///
    /// If no key is provided, all configuration values will be displayed.
    /// If no value is provided, the current value of the key will be displayed.
    /// If both a key and a value are provided, the key will be set to the value.
    Config {
        /// The key to set
        key: Option<String>,
        /// The value to set the key to
        value: Option<String>,
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
    /// Run a git command for all projects
    Git {
        #[arg(allow_hyphen_values = true, hide = true)]
        rest: Vec<String>,
    },
}

#[derive(Debug, Subcommand)]
pub enum SnapshotCommands {
    /// Create a snapshot of the project
    Create {
        /// Include specific repositories in the snapshot or all repositories if not specified
        #[arg(long, short = 'r', value_delimiter = ',', num_args = 1..)]
        include_repositories: Option<Vec<Repository>>,

        /// Generate a patch file for the snapshot with current changes for each repository
        #[arg(long, short = 'p')]
        generate_patch: bool,

        /// Include specific databases in the snapshot or all databases if not specified
        #[arg(long, short = 'd', value_delimiter = ',', num_args = 1..)]
        include_databases: Option<Vec<String>>,
    },
    /// Restore a snapshot of the project
    Restore {
        /// Path to the snapshot file
        path: PathBuf,
    },
}

#[derive(Debug, Parser)]
pub enum ProjectCommands {
    /// Start the project
    Up {
        #[arg(allow_hyphen_values = true, hide = true)]
        rest: Vec<String>,
    },
    /// Stop the project
    Down {
        #[arg(allow_hyphen_values = true, hide = true)]
        rest: Vec<String>,
    },
    /// Restart the project
    Restart {
        #[arg(allow_hyphen_values = true, hide = true)]
        rest: Vec<String>,
    },
    /// Start an interactive shell in the project
    Shell {
        #[arg(allow_hyphen_values = true, hide = true)]
        rest: Vec<String>,
    },
    /// Alias for node in the project
    Node {
        #[arg(allow_hyphen_values = true, hide = true)]
        rest: Vec<String>,
    },
    /// Alias for npm in the project
    Npm {
        #[arg(allow_hyphen_values = true, hide = true)]
        rest: Vec<String>,
    },
    /// Alias for yarn in the project
    Yarn {
        #[arg(allow_hyphen_values = true, hide = true)]
        rest: Vec<String>,
    },
    /// Alias for php in the project
    Php {
        #[arg(allow_hyphen_values = true, hide = true)]
        rest: Vec<String>,
    },
    /// Alias for artisan in the project
    Artisan {
        #[arg(allow_hyphen_values = true, hide = true)]
        rest: Vec<String>,
    },
    /// Alias for composer in the project
    Composer {
        #[arg(allow_hyphen_values = true, hide = true)]
        rest: Vec<String>,
    },
    /// Alias for phpunit in the project
    Phpunit {
        #[arg(allow_hyphen_values = true, hide = true)]
        rest: Vec<String>,
    },
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
