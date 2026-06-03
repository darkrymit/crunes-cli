# @darkrymit/crunes-cli

> Fast sandboxed scripting, isolated workspace execution, and dynamic context-ingestion framework.

Crunes allows developers and AI coding agents to write and run secure, sandboxed scripts (`runes`) directly inside a project workspace. Runes execute within isolated V8 environments (`isolated-vm`), utilizing a granular capability-based permission model to interact with the filesystem, databases, and network APIs safely.

---

## Key Features

* **V8 Sandbox Isolation:** Runes are evaluated inside secure `isolated-vm` sandboxes with zero direct access to Node.js builtins.
* **Capability-Based Security:** Fine-grained whitelist and blacklist rules (e.g. `fs.read:src/**`, `http.fetch:GET::https://api.github.com/*`) configured at the project level.
* **Premium Developer Experience:** Modern modular scripting (`import { fs, section } from '@utils'`) with native TypeScript types and autocompletion.
* **Interactive Tooling:** Shell sessions, background daemon jobs, built-in SQLite/JSON/YAML parsers, custom templates, and loopback HTTP/WebSocket servers with path-param routing.
* **AI-First Design:** Outputs cleanly formatted Markdown structures optimised for AI context window ingestion and pipe/CLI pipelines.

---

## Installation

Install globally via `npm`:

```bash
npm install -g @darkrymit/crunes-cli
```

*Requires Node.js ≥ 20.*

---

## Quick Start

Initialize a project, scaffold a rune, and execute it:

```bash
cd your-project

# Initialize .crunes/config.json
crunes init

# Scaffold a new rune (.crunes/runes/fetch-status.js)
crunes create fetch-status

# Run the rune and output the markdown sections
crunes run fetch-status
```

---

## Commands

```bash
# Core Operations
crunes init                          # Create .crunes/config.json in current project
crunes create [key]                  # Scaffold a new rune and register it in config
crunes run <key> [args...]           # Run a rune (use -b for batch execution)
crunes check <key>                   # Execute a rune and validate its return schema
crunes bench <key>                   # Profile execution time (fast/ok/slow)
crunes list                          # List all registered local and plugin runes

# Interactive Documentation (Dynamic CLI Help)
crunes docs intro                    # Compile workspace and ecosystem handbook
crunes docs rune <key...>            # Show arguments schema, help, and usages
crunes docs utils [namespaces...]    # Show detailed signatures for the @utils API

# Background Daemon Jobs
crunes job list                      # List background jobs for the project
crunes job kill <id>                 # Forcefully terminate a running background job

# Templates, Plugins, and Markets
crunes template list                 # List available rune templates
crunes template use <name>           # Copy a template as a new local rune
crunes plugin install <pkg>          # Install a secure plugin from marketplace
crunes plugin list                   # List active marketplace plugins
crunes marketplace add <url>         # Register a marketplace source
```

---

## Ecosystem Documentation

Crunes features a fully dynamic documentation engine built directly into the CLI. Rather than keeping static, outdated markdown guides, you can compile up-to-date workspace handbooks containing precise types, active schemas, and active permissions:

### 1. Compile the Ecosystem & Workspace Handbook
Generates a comprehensive `INTRO.md` containing sandboxed ESM recipes, permission tokens, active workspace settings, and current plugins:
```bash
crunes docs intro --out INTRO.md
```

### 2. Query `@utils` Sandbox API Signatures
Read function parameters, return values, fields, and permission restrictions dynamically compiled from TypeScript declarations:
```bash
crunes docs utils fs sqlite
```

### 3. Check Custom Rune Schemas
Read custom arguments, positional parameters, and examples for any of your local or plugin-registered runes:
```bash
crunes docs rune fetch-status
```

---

## License

MIT © [Tamerlan Hurbanov (DarkRymit)](https://github.com/darkrymit)
