# Hummingbird CLI

## Overview

**Hummingbird CLI** is an internal command-line tool designed to streamline interactions with the Hummingbird development stack. This tool simplifies starting, stopping, and managing projects/containers, whether globally or on a per-project basis. It provides a consistent interface for developers working within the stack.

## Features

- Run commands globally across all projects or target specific projects.
- Supports interactive and non-interactive modes.
- Includes debugging options for increased verbosity.
- Built-in commands for managing individual projects and services.

## Installation

Ensure the tool is properly installed and accessible from your terminal. For internal use only, follow the company’s installation guidelines.

## Usage

The CLI provides multiple commands and subcommands to manage the stack. Below is a guide to the available options.

### Global Options

```bash
USAGE:
    hbt [OPTIONS] <COMMAND>

OPTIONS:
    -v, --verbose             Increase verbosity for debugging purposes (use multiple times for higher levels).
    -n, --non-interactive     Run the command in non-interactive mode (use with caution).
    -h, --help                Show help information.
    --version                 Show the version.
```

### Commands

#### General Commands

- **doctor**
  - Checks the configuration for potential issues.

#### Database Commands

- **dump**

  - Dumps MySQL databases.
  - Arguments:
    - `key` (type: Kebab) — A unique key to identify the dump.

- **restore**
  - Restores MySQL databases.
  - Arguments:
    - `key` (type: Kebab) — A unique key for the restore.

#### Project-Specific Commands

Run commands for individual projects or services within the stack. Supported projects include:

- `traefik`, `infra`, `gateway`, `rates`, `search`, `operations`, `foundation`, `products`, `api`, `app`, `nest`

Example usage:

```bash
hbt rates up
```

Each project supports the following subcommands:

- **up**

  - Start the project.

- **down**

  - Stop the project.

- **restart**

  - Restart the project.

- **shell**

  - Start an interactive shell in the project.

- **node**

  - Alias for running Node.js commands.

- **npm**

  - Alias for running npm commands.

- **yarn**

  - Alias for running yarn commands.

- **php**

  - Alias for running PHP commands.

- **artisan**

  - Alias for running Laravel Artisan commands.

- **composer**

  - Alias for running Composer commands.

- **phpunit**

  - Alias for running PHPUnit commands.

- **dump**

  - Dump the project’s database.
  - Options:
    - `key` (optional) — A unique key for the dump.

- **restore**
  - Restore the project’s database.
  - Options:
    - `path` — The path to the dump file.

#### Global Project Commands

Commands affecting all projects in the stack:

- **up**

  - Start all projects.
  - Arguments:
    - `rest` (optional) — Additional arguments to pass to the command.

- **down**

  - Stop all projects.
  - Arguments:
    - `rest` (optional) — Additional arguments to pass to the command.

- **restart**
  - Restart all projects.
  - Arguments:
    - `rest` (optional) — Additional arguments to pass to the command.

#### Fallthrough Commands

The CLI also supports custom external commands. These are passed as raw arguments:

```bash
hbt some-custom-command arg1 arg2
```

## Examples

1. Start a specific project:

   ```bash
   hbt rates up
   ```

2. Restart all projects:

   ```bash
   hbt all restart
   ```

3. Dump a project database with a specific key:

   ```bash
   hbt app dump --key=my-database-key
   ```

4. Increase verbosity for debugging:

   ```bash
   hbt -vvv app up
   ```

## License

This tool is proprietary and intended for internal use only. Do not distribute without authorization.
