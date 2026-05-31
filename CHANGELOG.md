# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.10] - 2026-05-31

### Added
- **Local Project Storage**: New `@local-project-cache` and `@local-project-sqlite` virtual prefixes store data in `.crunes/caches/` and `.crunes/sqlite/` within the project directory, alongside matching `@global-project-*`, `@global-plugin-*`, and `@local-project-plugin-*` prefixes replacing the old `@project-*` / `@plugin-*` naming.
- **Local Config Overrides**: `config.local.json` and `project.local.json` are merged on top of their base counterparts at load time, allowing machine-specific overrides without modifying committed config.
- **Separate Args Lifecycle Permissions**: `args` lifecycle now enforces its own permission scope independently from `use` to prevent privilege leakage across lifecycle phases.
- **utils.db Network Database Client**: New `utils.db` namespace provides a unified HTTP-based database client for interacting with remote SQL databases over a REST API.
- **codec Namespace**: Encoding utilities (base64, hex, etc.) extracted from `utils.crypto` into a dedicated `utils.codec` namespace for clearer separation of concerns.
- **sqlite.run() Multi-Statement Support**: New `run(sql)` method on `SqliteHandle` executes raw multi-statement SQL strings (schema init, migrations) without parameter binding.
- **cache.has() Method**: New `has(key)` method on `CacheHandle` returns whether a key exists and has not expired without retrieving the value.
- **fs.append, fs.appendAsBytes, fs.chmod**: Three new filesystem utilities — `append` and `appendAsBytes` write to files without truncating, `chmod` sets file permissions.

---

## [0.5.9] - 2026-05-26

### Added
- **Recursively Nested Commands**: Sandboxed arguments parser (`ArgBuilder`) now supports recursive `.command()` groups and sub-actions (e.g., `remote add`).
- **Positional Parameter Mapping**: Automatically maps parsed positional arguments (e.g. `<name>`, `[url]`) directly to named keys (e.g. `args.name`, `args.url`) inside the `use(args)` lifecycle.
- **Implicit Command Helpers**: Automatically exposes space-separated `args.command` and array `args.commands` for quick sub-routing.
- **V8 Isolate Safe Arg-Building**: Compiles argument schemas completely inside the bootstrap isolate sandbox before cloning to prevent `isolated-vm` function cloning errors.
- **Progressive Help Subcommands**: Added dedicated `crunes docs use` and `crunes docs args` subcommands to progressively guide users through CLI actions instead of reading the entire handbook.
- **Indented Tree Help Formatting**: Renders nested commands, options, and positionals using a structured tree layout with relative indentation offsets.

### Changed
- **Ecosystem ACI Skill Integration**: Updated `crunes-write-rune` prompt templates to document recursive nested commands and automatic positional schema mappings.

---

## [0.5.8] - 2026-05-26

### Fixed
- **Sandbox setTimeout routing corrected**: Fixed `globalThis.setTimeout` inside isolate sandboxes to correctly route to the unref'd host timer bridge (`$__utils_time_after`) instead of the ref'd one, preventing background timeout guards (like in `chat.js`) from holding the process alive after all other active operations have finished.

---

## [0.5.7] - 2026-05-26

### Fixed
- **Rune process hang after completion**: Host-side `setTimeout` handles backing `time.after` are now `.unref()`'d, so a pending timeout (e.g. a race-pattern guard timer) no longer keeps the CLI process alive after the rune has already returned its result.

---

## [0.5.6] - 2026-05-26

### Added
- **Global Sandbox APIs**: Standard timing functions (`setTimeout`, `clearTimeout`, `setInterval`, `clearInterval`) and encoding utility classes (`TextEncoder`, `TextDecoder`) are now exposed globally on `globalThis` inside execution isolates.
- **Isolated Types**: Added a dedicated `src/rune/api/types-globals/` directory and `typedoc-globals.json` compilation configuration to isolate global types from standard libraries.
- **Ignored Dynamic Files**: Added `INTRO.md` and `globals-api.json` to respective `.gitignore` files to keep on-demand files untracked.

### Changed
- **Renamed Types Directory**: Moved core type definitions folder from `types` to `types-utils` to establish structural naming consistency alongside `types-lifecycle`.

### Fixed
- **Virtual Root Named Permissions**: Resolved a bug in the permission matching store where named sub-scopes (e.g., `cache.read:@project-cache:chat-session`) containing colons were incorrectly matched, ensuring cache and SQLite exact scoping is fully recognized.

---

## [0.5.5] - 2026-05-26

### Added
- **`crypto` encoding conversions**: Added `toHex`, `fromHex`, `toBase64`, `fromBase64`, `fromUtf8`, `toUtf8` as pure in-isolate synchronous helpers on the `crypto` namespace for ergonomic byte ↔ string conversions without host round-trips.
- **`crypto.hmac` family**: Added `hmac`, `hmacAsHex`, and `hmacAsBase64` for HMAC-based message authentication.
- **`crypto.encrypt` / `crypto.decrypt`**: Added symmetric encryption and decryption (e.g. `aes-256-cbc`, `aes-256-gcm`) returning raw `Uint8Array`.
- **`fs.remove`**: Deletes a file or directory; accepts an optional `{ recursive }` flag. Requires `fs.write:` permission.
- **`fs.move`**: Moves a file or directory between paths with automatic cross-volume copy-delete fallback. Requires `fs.read:` and `fs.write:` permissions.
- **`fs.stat`**: Returns file metadata (`size`, `mtime`, `birthtime`, `isFile`, `isDirectory`). Requires `fs.read:` permission.
- **`fs.mkdir`**: Recursively creates empty directory structures. Requires `fs.write:` permission.
- **`fs.readAsBytes`**: Reads a file as raw binary `Uint8Array`. Requires `fs.read:` permission.
- **`fs.writeAsBytes`**: Writes raw binary `Uint8Array` to a file, creating parent directories as needed. Requires `fs.write:` permission.
- **`archive.tar` / `archive.untar` `opts.gzip` option**: Both methods now accept an optional third argument `{ gzip?: boolean }`. `tar` defaults to `gzip: true` (compressed). `untar` auto-detects compression from the file's magic bytes when `gzip` is omitted, so callers rarely need to specify it.
- **`http.fetch` multipart body**: `body` now accepts a `MultipartEntry[]` array (with `name`, `value`, optional `filename` and `contentType`) to send `multipart/form-data` requests, including binary `Uint8Array` file parts.
- **`md.blockquote`**: Renders a Markdown blockquote block.
- **`TextEncoder` / `TextDecoder` polyfills**: Both classes are now available globally inside rune isolates.
- **`archive` example `tar-demo` rune**: Demonstrates `tar`, `untar`, `targz`, and `untargz` in a single runnable example.

### Changed
- **`crypto` API is now fully async across binary-boundary methods**: `hash`, `hashAsHex`, `hashAsBase64`, `hmac`, `hmacAsHex`, `hmacAsBase64`, `encrypt`, and `decrypt` now return `Promise`. This eliminates `Array.from()` overhead on large binary inputs by using `ArrayBuffer` transfer via the async `isolated-vm` bridge. `uuid`, `randomHex`, `randomBase64`, and all encoding converters remain synchronous.
- **Updated `crypto.d.ts`**: All async methods now declare `Promise<Uint8Array>` or `Promise<string>` return types.
- **`archive.tar` / `archive.untar`**: Replaced the separate `targz` / `untargz` methods with a unified `opts.gzip` option on `tar` and `untar`. Pass `{ gzip: true }` for compressed archives. `targz` and `untargz` are removed.
- **`json.get` renamed to `json.readPath`** and **`json.getAll` renamed to `json.readPathAll`** for API clarity. **Breaking** — runes calling `json.get` / `json.getAll` must be updated.

### Fixed
- **`isolated-vm` binary data marshalling**: Resolved a bug where `Uint8Array` values passed from the isolate to host bridges via `applySync` arrived empty. The fix uses `ArrayBuffer` transfer via async `apply` for all binary-input host calls, and explicit `Array.from()` + `result: { copy: true }` was replaced with proper async bridging.
- **`$__crypto_hash_hex` / `$__crypto_hash_base64` host bridges**: Wrapped bare function references in explicit handlers that normalise `ArrayBuffer` input (matching the pattern of all other binary bridges).
- **`release` rune**: Fixed `json.get` calls (renamed to `json.readPath` in this release) so the release rune is operational again.
- **Example `.gitignore` files**: Added `.gitignore` to all 11 examples that were missing one, including common IDE exclusions (`.vscode/`, `.idea/`, `*.iml`). The `archive` example additionally ignores its runtime-generated `backups/` and `restore/` directories. The `unified-paths` example `.gitignore` was updated with the same IDE exclusions.

---

## [0.5.4] - 2026-05-25

### Fixed
- **Sub-namespace dynamic documentation**: Fixed walkUtilsDocs to recursively walk and format nested TypeScript namespaces (e.g. `crypto.hash`), ensuring `hash.hex` and `hash.base64` are accurately included in the handbook.
- **Dynamic list index prefixing**: Corrected a mapping bug that accidentally passed loop candidate indices to the walker, removing unexpected prefix numbers (e.g. `1.open(...)` -> `open(...)`).

---

## [0.5.3] - 2026-05-25

### Added
- **Dynamic Gated API Permissions inside JSDoc**: Documented sandboxed execution permissions directly inside TypeScript `.d.ts` declaration comments for all namespaces (`archive`, `cache`, `env`, `fs`, `http`, `rune`, `shell`, `sqlite`, `ws`), enabling automatic dynamic compiler extraction.
- **Concise Namespace Headers**: Streamlined namespace headers inside the dynamically generated handbook (e.g. `### fs` and `### ws`) to avoid confusing `utils.` prefixing.

### Fixed
- **ESM Code Recipe Optimizations**: Corrected handcrafted code recipes in `crunes docs intro` to be 100% accurate, idiomatic, return `RuneSection[]` structures, cleanly close connections (`db.close()`), and sleep/delay to receive websocket frames (`await time.after(500)`).
- **Glob slash escaping**: Escaped inner slashes in JSDoc comments to prevent premature syntax termination in TypeScript files.

---

## [0.5.2] - 2026-05-25

### Fixed
- **Code Recipe Accuracy in `crunes docs intro`**:
  - Corrected all namespace recipes to use idiomatic `@utils` ESM imports (`import { ws } from '@utils'`, etc.) instead of deprecated `utils` access.
  - Aligned the `ws` recipe with accurate `.on('message')` callbacks registered before socket `.open()`.
  - Corrected the `sqlite` recipe to invoke `.open('@project-sqlite')` and use the proper `.exec(...)` write interface.
  - Fixed `cache.set` recipe parameter order to use `ttl` seconds directly instead of a nested config object.
  - Corrected the `shell` recipe to use the accurate `shell.exec` method.
  - Refined the welcome statement and title to position Crunes as a fast sandboxed scripting environment.

---

## [0.5.1] - 2026-05-25

### Added
- **Dynamic Crunes Intro Command (`crunes docs intro`)**:
  - Compiles a complete, self-contained Markdown or JSON primer of the entire Crunes ecosystem.
  - Dynamically walk and format TypeDoc signatures for the `@utils` API reference using actual `.d.ts` types.
  - Fully unwrap and document custom return object properties and methods (e.g. `FetchResponse`, `CacheHandle`, `SqliteHandle`) even when wrapped in a `Promise<...>`.
  - Introspect local workspace configurations, dynamic isolate-resolving and inlining argument schemas, descriptions, and rules for all active project runes (`release`, `m`, `kb`).
  - Added `-g, --global` flag to bypass project introspection and generate a clean, pure-ecosystem manual.
  - Added `--out <path>` flag to write the compiled handbook to a file, and `--format md|json` support.

---

## [0.5.0] - 2026-05-25

### Added
- **WebSocket Support**:
  - Added `utils.ws` WebSocket client namespace to the sandboxed utils API.
  - Added sandboxed raw binary frame transmission (`Uint8Array` / `ArrayBuffer`) via `.sendBinary(data)`.
  - Added dedicated `'binary'` event in sandboxed event listeners yielding a raw `Uint8Array`.
  - Added `.closed()` method and full `WebSocketError` replication inside the isolate.
  - Zero-copy host-side memory wrapping using `ivm.ExternalCopy` native array transfers across isolate boundaries.
- **Interactive Shell Namespace**:
  - Exposed `utils.shell.exec(cmd)` and `utils.shell.execInSession(cmd)` for live command spawn streams, expect patterns, and terminal processes.
  - Added `--ccd` global flag to specify a separate config directory, allowing project-isolated `.crunes/` roots.
- **Rich Sandboxed Utilities (`@utils` module)**:
  - Exposed the `@utils` virtual ESM module for importing `fs`, `md`, `tree`, `section`, `crypto`, `sqlite`, etc. via `import { ... } from '@utils'`.
  - Added `utils.crypto`: SHA/MD5 hashing, UUID generation, and secure random hex/base64 byte strings.
  - Added `utils.sqlite`: high-performance `better-sqlite3`-backed SQLite client with persistent tables and scoped-by-project handle management.
  - Added `utils.cache`: named TTL key-value store for rune sandboxes.
  - Added `utils.archive`: native `zip`, `unzip`, `tar`, and `untar` operations.
  - Added `utils.yaml`, `utils.xml`, and `utils.json` with fully sandboxed `.read()`, `.write()`, and `.modify()` with comment-preserving round-trips.
  - Added `utils.fs.write` and `utils.fs.replace` tools for in-sandbox file writes.
  - Added `utils.fs.resolve` and `expandDirectories` option to `utils.fs.glob`.
  - Added `section` output filter with micromatch glob pattern support.
- **Declarative Rune Argument Builder**:
  - Added `args()` schema-driven builder API for rune argument parsing.
  - Added `crunes help rune` subcommand group with batch `-a` flag and `--format json`.
- **New Management Subcommands**:
  - Added `crunes job` command with ownership model (rune-spawned processes, kill, list, prefix-match kill) and `crunes jobs` command group.
  - Added `crunes cache` and `crunes sqlite` management command suites to provision, list, and delete sandboxed resources scoped by project.
  - Introduced TypeDoc-based API walkers: `crunes docs utils` and `crunes docs rune` (renamed from `crunes help`).
  - Added `m` (Module Structural Context) and `kb` (Knowledge Base Context) bundled context runes for AI model integration.
- **Plugin & Module Enhancements**:
  - Added support for `@plugin/` and `@project/` virtual module prefixes for plugin and project runes respectively.
  - Auto-permitted `.crunes/` reads for project runes.
  - Isolated local plugin dependencies in their own install directory without polluting the workspace.
- **Unified Path Resolution**:
  - Introduced virtual roots, dotfile-based permission grants, and consistent token format across all `utils.fs` operations.
  - Plugin runes auto-receive `fs.read:@plugin/**` in their effective permission set.

### Changed
- **Restructured codebase**: Reorganized `src/` into clean, feature-first modular directories: `cli`, `rune`, `job`, `marketplace`, `plugin`, `project`, `shared`, `store`, `cache`, `sqlite`, `docs`, `template`.
- **Breaking**: Renamed WebSocket `.send()` to `.sendText(msg)` for clean method symmetry with `.sendBinary()`.
- **Breaking**: Renamed shell methods to `.exec()` and `.execInSession()` inside `utils.shell` (previously `shell.run` capability string, now `shell.exec`).
- **Breaking**: Standardized `use`, `check`, and `bench` command arguments to consistent CLI syntax with explicit positional/flag tiers.
- Renamed `help` command group to `docs` and `jobs` command group to `job`; cache and sqlite resources are now scoped by project.
- Moved `getProjectKey` and `shortHash` to `src/project/` as the unified project identity module.
- Placed batching `+` token behind an explicit `-b` flag (`crunes -b use key1 + key2`); bare `+` tokens are no longer treated as batch separators without the flag.
- CLI now rejects rune keys starting with hyphens to catch misplaced global flags early.
- Decoupled identity metadata (author, description, homepage) from `plugin.json` and delegated to `marketplace.json`.
- Moved inline syntax documentation to `addHelpText` to reduce noise in top-level help output.
- Enforced `.crunes-plugin/` folder naming for remote marketplace plugin resolution.
- Strict namespaced permissions: migrated all permission declarations to `permissions.use.allow` format in `plugin.json`/`config.json`.
- Restricted `hostRequire` strictly to pre-approved safe Node.js builtins to prevent sandbox escapes.
- Resolved V8 isolate memory bloat by switching to `ivm.ExternalCopy` native array transfers across boundaries.
- Updated CI publish workflow: added a build step before test and publish so TypeDoc-generated `utils-api.json` exists.
- Updated TypeDoc output path from `src/help` to `src/docs` following the rename.

### Fixed
- Fixed `release` verification rune: corrected `program.js` path resolution, replaced bare `shell(...)` calls with `shell.exec(...)`, and aligned permission capability strings.
- Fixed `yaml` round-trip to preserve implicit `null` values and flow sequence style on `.modify()`.
- Fixed plugin uninstall to not delete the source directory when removing a local plugin.
- Fixed `rune create`, `template create`, and `plugin create` scaffolding to use the `use(args)` lifecycle API.
- Fixed plugin `create` scaffolding to emit namespaced permissions schema in `plugin.json`.
- Fixed `isolated-vm` stale `opts` 4th argument removal from isolate execution bridge.
- Fixed marketplace to correctly enforce `.crunes-plugin` folder for remote marketplace resolution.
- Fixed plugin update to preserve permissions correctly when bumping a plugin version.
- Fixed `--cwd` placement in `rune spawn` to correctly propagate the working directory.
- Fixed security: restricted `hostRequire` to builtins to prevent sandbox escape via dynamic require.

---

## [0.4.6] - 2026-05-02

### Changed
- Renamed npm package from `@darkrymit/crunes` to `@darkrymit/crunes-cli`.
- Renamed Claude Code plugin from `crunes` to `crunes-aci`.

---

## [0.4.5] - 2026-05-02

### Fixed
- Fixed update check URL and install instruction still pointing to `@darkrymit/context-runes`.
- Fixed `User-Agent` header in marketplace and install HTTP calls still using `context-runes-cli`.
- Fixed remaining `[context-runes]` log prefixes in the ACI hook wrapper.
- Fixed all interactive `intro()` prompts still displaying `context-runes` to users.
- Fixed `.crunes/config.json` rune path still referencing the old `.context-runes/` prefix.

### Changed
- Publish workflow: tag pattern narrowed to semver-only, `workflow_dispatch` added for manual triggering, concurrency guard added.

---

## [0.4.4] - 2026-05-02

### Changed
- Migrated package identity from `@darkrymit/context-runes` to `@darkrymit/crunes-cli`.
- Project config folder renamed from `.context-runes/` to `.crunes/`.
- Plugin manifest folder renamed from `.context-runes-plugin/` to `.crunes-plugin/`.
- Global store path changed from `~/.context-runes` to `~/.crunes`.
- Isolate env variable renamed from `CONTEXT_RUNES_PLUGIN_ROOT` to `CRUNES_PLUGIN_ROOT`.
- Version history re-baselined from `1.x.x` to `0.x.x`.

---

## [0.4.3] - 2026-04-21

### Fixed
- Fixed `fs.glob` permission enforcement. Glob patterns are now canonicalized (ensuring a `./` prefix for relative paths) before being checked against the permission list, resolving a regression where `fs.glob` calls were incorrectly denied when using the normalized syntax.

---

## [0.4.2] - 2026-04-20

### Added
- Added automatic path normalization for filesystem permissions (`fs.read`, `fs.exists`, `fs.glob`). Permission declarations can now use either bare paths (e.g., `package.json`) or prefixed paths (e.g., `./package.json`); both are automatically mapped to the internal canonical form.

---

## [0.4.1] - 2026-04-20

### Fixed
- Extracted CLI program factory to `src/program.js` to enable isolated testing of command definitions and completion logic.
- Fixed shell completion handlers to correctly receive the program instance, resolving failures in `bash`, `zsh`, `fish`, and `powershell` tab-completion.
- Formatted completion choices to ensure consistent behavior across different shells.

---

## [0.4.0] - 2026-04-20

### Added
- Added `crunes completions` command group with shell-specific handlers for bash, zsh, fish, and PowerShell.
- Added `crunes completions install <shell>` to automatically append the completion hook to the appropriate shell profile (idempotent).
- Completion candidates dynamically include rune keys from the current project config and plugin names from the global registry.
- Added `@plugin/` path prefix support in `utils.fs` so plugin runes can read files relative to their own plugin directory.
- Added `~/` path prefix support in `utils.fs` to resolve paths relative to the user's home directory.

### Changed
- Refactored `src/cli.js` to lazy-load all command handlers via dynamic `import()` at action time, reducing startup overhead for commands that are not invoked.
- Reworked `utils.fs` permission token generation: paths are now canonicalized to `./`-relative form before being checked against the permission list, making permission declarations consistent regardless of how the path was passed.
- Plugin runes automatically receive `fs.read:@plugin/**` in their effective permission set.

---

## [0.3.12] - 2026-04-20

### Added
- Added `AGENTS.md` and symlinks (`GEMINI.md`, `CLAUDE.md`) to guide AI coding assistants on project architecture and release workflows.
- Improved the `release` context rune to dynamically monitor version synchronization across `package.json`, `package-lock.json`, and `src/cli.js`.

### Fixed
- Fixed CI workflow to correctly use `npm test` (Vitest) instead of Node's built-in test runner.
- Replaced the `prepare` lifecycle hook with `prepack` in `package.json` to avoid redundant builds during `npm install`.
- Synchronized internal CLI version with `package.json`.

---

## [0.3.11] - 2026-04-20

### Changed
- Optimized test suite to focus on API contracts: removed redundant prose assertions that duplicated snapshot coverage, merged overlapping `PermissionError` tests, and dropped trivial factory-function tests with no branching logic.

---

## [0.3.10] - 2026-04-19

### Changed
- Internal version bump for npm sync.

---

## [0.3.9] - 2026-04-17

### Fixed
- Fixed `isolated-vm` segmentation faults on macOS + Node 20+ by dynamically injecting `--no-node-snapshot`.

---

## [0.3.8] - 2026-04-17

### Added
- Added granular trace logging inside `isolated-vm` lifecycle to pinpoint macOS segfaults.

---

## [0.3.7] - 2026-04-17

### Added
- Hardened error catching and added `--verbose` trace logs around execution to debug silent crashes.

---

## [0.3.6] - 2026-04-17

### Added
- Added `--verbose` global flag to print full stack traces on rune failures.

---

## [0.3.5] - 2026-04-17

### Changed
- Version bump to synchronize npm release.

---

## [0.3.4] - 2026-04-17

### Fixed
- Updated documentation to accurately reflect the latest CLI argument syntax, key parsing, and global flags.

---

## [0.3.3] - 2026-04-17

### Fixed
- Fixed a bug causing `crunes create` to output a non-standard config shape.
- Fixed an `isolated-vm` relative module resolution issue that led to crashes in nested imports.

---

## [0.3.2] - 2026-04-17

### Changed
- Wrapped markdown sections in ` ```md ``` ` fenced blocks.

---

## [0.3.1] - 2026-04-17

### Added
- Added support for `marketplace@plugin:key` syntax in template list/use commands.

---

## [0.3.0] - 2026-04-17

### Added
- Introduced the `use` command, `template` group, `bench`, `version`, and auto-resolve functionality.

---

## [0.2.1] - 2026-04-17

### Fixed
- Fixed isolate bootstrap sources embedding via esbuild plugin.

---

## [0.2.0] - 2026-04-17

### Changed
- Bundled CLI with esbuild for a lean global install.

---

## [0.1.0] - 2026-04-17

### Added
- Introduced plugin ecosystem, rune isolation, and composition.

---

## [0.0.6] - 2026-04-17

### Changed
- Migrated to the `runes` naming convention.

---

## [0.0.5] - 2026-04-17

### Changed
- Reworked global options parsing.

---

## [0.0.4] - 2026-04-17

### Fixed
- Fixed proper version update logic.

---

## [0.0.3] - 2026-04-17

### Changed
- Removed legacy handling code.

---

## [0.0.0] - 2026-04-17

### Added
- Initial release.
