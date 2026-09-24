---
type: pattern
title: Storage layers and the store path
description: Persistent state splits between a machine-wide store and per-project config, every path is computed by one module honouring CRUNES_STORE, and a directory that is not a project redirects its local state into the store.
tags: [architecture, storage, configuration]
resource: src/store/
---

# Storage layers and the store path

Two layers hold everything persistent, and they answer different questions.

**The store** — `~/.crunes/`, or whatever `$CRUNES_STORE` names — is machine-wide: installed plugins, marketplace caches, job records, cache and sqlite data, the global config, and global runes and templates. It is shared by every project on the machine.

**The project** — `.crunes/` — is per-project: registered runes, which plugins are enabled, permission overrides and variables. Plus `project.local.json`, a gitignored identity file, and `config.local.json`, a gitignored override layer.

The split is what makes a plugin *install once, enable anywhere, restrict per project*. Installing writes the machine layer; enabling writes the project layer; a project narrowing a plugin's grants touches only its own file and no other project notices.

## The store root is the global config directory

There is no `.crunes/` segment inside the store. `<store>/config.json` is the global config, global runes are `<store>/runes/<key>.js`, templates `<store>/templates/<name>.js`. `~/.crunes` already *is* the config directory, and expecting `~/.crunes/.crunes/config.json` is the most common mistake made when writing a global path by hand.

## One module computes every path

Every module that needs a location imports a helper from `src/store/` rather than joining paths itself. This is not tidiness — it is the mechanism test isolation rests on.

`getStorePath()` reads `process.env.CRUNES_STORE ?? path.join(os.homedir(), '.crunes')` **at call time.** Tests point that variable at a temp directory and operate in complete isolation with no filesystem mocking. A module that computes a store path independently and ignores the variable does not merely duplicate logic: it writes into the developer's real home directory during a test run, and the next run starts with state the previous one left behind.

Directories are created lazily, and only two exist after initialisation. A missing subdirectory means that feature has never been used, so code that reads one must treat absence as *no data* rather than as an error.

## Rootless: a directory that is not a project

A directory with no `.crunes/config.json` is not a project. Rather than refusing to run, or scattering `.crunes/` directories wherever someone happened to invoke the CLI, all local state redirects into `<store>/rootless/<hash-of-cwd>/`.

`getLocalBase(projectDir)` is the single function that decides this, returning either `<projectDir>/.crunes` or the rootless base, so every consumer routes through one place and no call chain needed a new argument.

The invariant it buys: **a rootless run writes nothing outside the store.** Permission patterns and `@project/` still resolve against the working directory, which is what lets a personal global rune act on whatever directory it was invoked from while leaving no trace beside it.

The trap that follows is in tests: a bare temp directory *is* rootless, so a test expecting state under `<dir>/.crunes/` must write a `config.json` there first. See [rootless surprises in tests](/gotchas/rootless-temp-dirs.md).

## Bucket keys carry a hash

Cache and sqlite buckets are opened by name, and two projects may both open one called `timestamps`. Each on-disk key carries a hash suffix derived from the scope and the name — and, for plugin scopes, the plugin id — so identical names in different scopes cannot collide.

`local` scope hashes only the name, so isolation there comes from directory structure instead: each project's local data already lives inside its own `.crunes/`.
