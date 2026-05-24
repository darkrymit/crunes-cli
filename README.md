# @darkrymit/crunes-cli

CLI tool for managing and querying crunes. Part of the [crunes](https://github.com/darkrymit/context-runes) ecosystem.

## Installation

```bash
npm install -g @darkrymit/crunes-cli
```

Requires Node.js ≥ 20.

## Commands

```
crunes init                    Create .crunes/config.json in the current project
crunes create [key]            Scaffold a new rune and register it in config
crunes use [--section s] <key> [args...] [+ ...]   Use one or more runes and output the result (use --fail-fast to stop on error)
crunes check <key>             Run a rune and validate its output shape
crunes bench <key>             Time rune execution and report fast/ok/slow (use --runs <n> to average, --warmup to add a discarded warm-up run)
crunes list                    List all registered runes
crunes jobs list               List background jobs for the current project
crunes jobs kill <id>          Send SIGTERM to a job and remove its record (prefix match on id)
crunes doctor                  Verify environment and project setup
crunes version                 Print the installed version and check for updates
crunes help rune <key...>      Show usage, argument schema, and examples for one or more runes
crunes completions install <shell>  Install shell tab-completion hook (bash, zsh, fish, powershell)
```

**Template management:**

```
crunes template list [source]  List available templates
crunes template use <key>      Copy a template into the project as a new rune
crunes template create [name]  Scaffold a new template file
```

**Plugin management:**

```
crunes plugin install <marketplace>@<plugin>   Install a plugin from a configured marketplace
crunes plugin uninstall <name>                 Uninstall a plugin
crunes plugin list                             List installed plugins
crunes plugin update [name]                    Update one or all installed plugins
crunes plugin enable <name>                    Enable a disabled plugin
crunes plugin disable <name>                   Disable a plugin without uninstalling it
```

**Marketplace sources:**

```
crunes marketplace add <url>       Add a marketplace source (URL or local path)
crunes marketplace remove <url>    Remove a marketplace source
crunes marketplace list            List configured sources
crunes marketplace search <query>  Search for plugins across all sources
```

**Cache management:**

```
crunes cache list              List all registered cache buckets
crunes cache clear <id>        Remove expired keys from a cache bucket
crunes cache delete <id>       Delete a cache bucket and deregister it
crunes cache unset <id> <key>  Remove a single key from a cache bucket
```

**SQLite management:**

```
crunes sqlite list             List all registered SQLite databases
crunes sqlite delete <id>      Delete a SQLite database and deregister it
crunes sqlite query <id> <sql> Run a readonly SQL query against a registered database
```

**Global flags:**

```
-v, --version         Print version number (or --verbose / -v if a command is present)
-y, --yes             Assume yes to all prompts (also auto-detected in non-TTY environments)
-p, --plain           Plain output: no colors, no box-drawing — optimised for AI/pipe use
    --cwd <path>      Project root to use instead of the current working directory
    --verbose, -v     Print full stack traces on errors (contextual: -v acts as --verbose when a command is given)
```

**Output formats** (for `use` and `list`):

```
--format md     Human-readable markdown output (default)
--format json   Machine-readable JSON — used by the Claude Code plugin hook
```

## Project Setup

```bash
cd your-project
crunes init               # creates .crunes/config.json
crunes create docs        # scaffolds .crunes/runes/docs.js
crunes use docs           # runs the rune and prints output
crunes use docs + api v2  # runs multiple runes in batch
```

## Key Syntax

Commands that accept a `<key>` (like `crunes use`, `crunes bench`, and `crunes check`) use this syntax:

```
[--section s1,s2] [source:]name [rune-arg ...]
```

- `name`: The name of the rune (auto-resolved from project config first, then plugins).
- `source:`: Forces resolution from a specific source.
  - `local:name` resolves strictly from `.crunes/config.json`.
  - `my-plugin:name` resolves strictly from an installed plugin.
- `rune-arg ...`: Everything after the key is passed verbatim to the rune as `args._` (or parsed against the rune's `args()` schema if it exports one). This includes flags — `--verbose`, `--format`, etc.
- `--section s1,s2`: Filters the output to only include the named sections (must appear before the key).

`crunes use` accepts multiple rune segments separated by `+`:

```bash
crunes use structure + api v2
crunes use --section layout structure + --section files api
```

**Command-level flags must come before the first key.** The `use` command's own flags (`--format`, `--fail-fast`) and `bench`'s flags (`--runs`, `--warmup`) are only recognised at the start of the argument list. Once the parser hits the first key, all remaining tokens (including flags) belong to the rune:

```bash
# correct — command flags before the key
crunes use --format json mykey --rune-flag val

# rune receives --format as its own arg (command format stays 'md')
crunes use mykey --format custom
```

## Rune API

A rune is an ES module that exports a `use` function and imports utilities via `@utils`:

```js
import { md, section } from '@utils'

export async function use(args) {
  // args._         — positional arguments (string[])
  // args.verbose   — named flag value (if args() export is defined)
  return section.create('my-section', {
    type: 'markdown',
    content: md.h3('Hello!'),
  })
}
```

Every namespace is a named export from `@utils`:

```js
import { md, tree, section, fs, shell, json, yaml, xml,
         fetch, env, vars, archive, cache, sqlite, crypto, rune } from '@utils'
```

**Typed arguments** — export an `args` function using the builder API:

```js
export async function args(b) {
  return b
    .option('-v, --verbose', 'Verbose output', false)
    .option('-c, --count <number>', 'Max results', 10)
    .positional('<target>', 'Target path')
    .example('crunes use myrune foo', 'Basic use')
    .build()
}
```

### Return values

**Single section:**

```js
return section.create('my-section', { type: 'markdown', content: '...' })
// or
return section.create('my-section', { type: 'tree', root: tree.node('src', 'Source root') })
```

**Multiple sections:**

```js
return [
  section.create('setup',     { type: 'markdown', content: '...' }),
  section.create('structure', { type: 'tree',     root: tree.node('src', 'Source root') }),
]
```

---

### `md` — Markdown builders

All functions are pure (no I/O).

| Function | Output |
|---|---|
| `md.h1(text)` | `# text\n` |
| `md.h2(text)` | `## text\n` |
| `md.h3(text)` | `### text\n` |
| `md.p(text)` | `text\n` |
| `md.bold(text)` | `**text**` |
| `md.italic(text)` | `_text_` |
| `md.code(text)` | `` `text` `` |
| `md.codeBlock(text, lang?)` | fenced code block |
| `md.ul(items)` | unordered list |
| `md.ol(items)` | ordered list |
| `md.link(text, url)` | `[text](url)` |
| `md.table(headers, rows)` | GFM table |

---

### `tree` — Tree builders

Pure — no I/O.

```js
tree.node(name, description, children?)
// → { name, description, children: [] }

tree.format(root, { style: 'tree' | 'list', bullet: '-' | '*' | '+' }?)
// → formatted string
```

---

### `section` — Section builder

```js
section.create(name, data, { title?, attrs? }?)
// → { name, title, attrs, data }
// name must be kebab-case; data must be { type: 'markdown', content } or { type: 'tree', root }

section.match(name)
// → boolean — true if name matches the active --section filter (use for early-exit optimisation)

section.selected()
// → string[] | null — the active section filter list, or null if no filter is active
```

---

### `fs` — Filesystem access

Permission token: `fs.read:`, `fs.write:`, `fs.glob:` (local runes: unrestricted; plugin runes: declared in `plugin.json`).

```js
fs.cwd()
// → string — absolute path to the project root

await fs.read(relPath, { throw: true }?)
// → string | null   (null only when throw: false and file missing)

await fs.exists(relPath)
// → boolean

await fs.glob(pattern, { ignore?: string[], onlyDirectories?: boolean }?)
// → string[]   (forward-slash paths, relative to project root)

await fs.write(relPath, content)
// → void — creates parent directories automatically

await fs.copy(src, dest)
// → void — creates parent directories automatically; copies a single file

await fs.replace(relPath, regex, replacement)
// → void — reads, applies String.replace(regex, replacement), writes back
```

**Path prefixes:**

| Prefix | Resolves to |
|---|---|
| `relative/path` | Project root |
| `@project/path` | Project root (explicit alias) |
| `@plugin/path` | Plugin install directory (plugin runes only) |
| `~/path` | User home directory |

---

### `shell` — Shell execution

Permission token: `shell:<cmd-prefix>` (exact-prefix match against the full command string).

```js
await shell(cmd, { throw?: true, trim?: true, timeout?: 30000, env?: {} }?)
// → string          when trim: true (default) — trimmed stdout
// → { stdout, stderr, exitCode }   when trim: false
```

Throws `ShellError` (with `.stdout`, `.stderr`, `.exitCode`) on non-zero exit unless `throw: false`.

---

### `json` — JSON files

Inherits `fs.read:` / `fs.write:` permission tokens.

```js
await json.read(relPath, { throw?: true }?)
// → object | null

await json.get(relPath, jsonPath, defaultValue?)
// → any — first JSONPath match, or defaultValue

await json.getAll(relPath, jsonPath, defaultValue?)
// → any[] — all JSONPath matches, or defaultValue (default: [])

await json.write(relPath, data, { spaces?: 2 }?)
// → void

await json.modify(relPath, async (data, { exists }) => { ... }, { initial?, spaces?: 2 }?)
// → void — reads file (or uses initial if missing), calls callback, writes result back
//   callback may return a new value or mutate data in place (return undefined = use mutated data)
//   throws if file missing and initial is not provided
```

---

### `yaml` — YAML files

Inherits `fs.read:` / `fs.write:` permission tokens. Preserves comments and formatting on round-trips.

```js
await yaml.read(relPath, { throw?: true }?)
// → object | null

await yaml.write(relPath, data, { indent?: 2 }?)
// → void

await yaml.modify(relPath, async (data, { exists }) => { ... }, { initial?, indent?: 2 }?)
// → void — same semantics as json.modify
```

---

### `xml` — XML files

Inherits `fs.read:` / `fs.write:` permission tokens. Attributes use `@_` prefix; comments use `#comment`.

```js
await xml.read(relPath, { throw?: true }?)
// → object | null

await xml.write(relPath, data, { indent?: 2 }?)
// → void

await xml.modify(relPath, async (data, { exists }) => { ... }, { initial?, indent?: 2 }?)
// → void — same semantics as json.modify
```

---

### `fetch` — HTTP client

Permission token: `fetch:<METHOD>:<url>` (e.g., `fetch:GET:https://api.example.com/*`).

```js
const res = await fetch(url, { method?: 'GET', headers?: {}, body?, timeout?: 30000 }?)
// res.ok         — boolean
// res.status     — number
// res.statusText — string
// res.headers    — object
// await res.text() — string
// await res.json() — any
```

Throws `FetchError` on network errors or timeouts.

---

### `env` — Environment variables

Permission token: `env:<source>:<key-glob>` where source is `process` or a `.env` filename (e.g., `env:process:API_*`, `env:.env:*`).

```js
env.get(key, fallback?)
// → string | fallback — reads from process.env or .env files per allowed patterns

env.has(key)
// → boolean
```

---

### `vars` — Static config values

Values come from the `vars` field in `.crunes/config.json` for the rune entry. No permission gate.

```js
vars.get(key, fallback?)
// → any

vars.has(key)
// → boolean
```

---

### `archive` — Compression

Permission tokens: `fs.read:<source>` and `fs.write:<dest>`.

```js
await archive.unzip(source, dest)   // extracts a .zip into dest directory
await archive.zip(source, dest)     // zips a file or directory into dest
await archive.untar(source, dest)   // extracts a .tar.gz into dest directory
await archive.tar(source, dest)     // creates a .tar.gz from a file or directory
```

Paths are relative to the project root. Zip-slip is detected and rejected.

---

### `cache` — Persistent key-value cache

Permission tokens: `cache.read:<location>:<name>` and `cache.write:<location>:<name>`.

```js
const store = await cache.open(location, name?)
// location — virtual store token (see below) or relative path
// name     — sub-namespace within the location (default: 'default')

await store.set(key, value, ttl?)   // ttl in seconds; omit for no expiry
await store.get(key)                 // → value | null (expired entries return null)
await store.delete(key)
await store.clear()                  // removes all keys in this store
```

**Virtual locations:**

| Token | Scope |
|---|---|
| `@project-cache` | Project-scoped; local runes |
| `@project-plugin-cache` | Project + plugin scoped (plugin runes) |
| `@plugin-cache` | Plugin-global across all projects (plugin runes) |

Values must be JSON-serializable. Stored as individual `.json` files on disk.

---

### `sqlite` — SQLite databases

Permission tokens: `sqlite.read:<location>:<name>` and `sqlite.write:<location>:<name>`.

```js
const db = await sqlite.open(location, name?)
// location — virtual store token or relative path
// name     — database filename without extension (default: 'default' → 'default.sqlite')

db.query(sql, params?)       // → any[]        — all matching rows
db.get(sql, params?)         // → any | null   — first matching row or null
db.exec(sql, params?)        // → { changes, lastInsertRowid }
await db.transaction(async () => { ... })  // auto-commits; rolls back on throw
db.close()                   // closes the connection (auto-closed at rune exit)
```

**Virtual locations:**

| Token | Scope |
|---|---|
| `@project-sqlite` | Project-scoped; local runes |
| `@project-plugin-sqlite` | Project + plugin scoped (plugin runes) |
| `@plugin-sqlite` | Plugin-global across all projects (plugin runes) |

WAL mode is enabled automatically.

---

### `crypto` — Cryptographic utilities

No permission gate. Synchronous.

```js
crypto.hash.hex(algorithm, data)    // → hex string  (e.g. algorithm: 'sha256')
crypto.hash.base64(algorithm, data) // → base64 string

crypto.uuid()          // → v4 UUID string
crypto.hex(size)       // → hex-encoded random bytes (size = byte count)
crypto.base64(size)    // → base64-encoded random bytes
```

---

### `rune` — Call other runes

Inherits the target rune's permissions. Circular calls throw `CircularRuneError`.

```js
const sections = await rune.use(key, args?)
// key  — bare key or plugin:key
// args — string[] of positional arguments
// → Section[]
```

## Plugins

Plugins extend crunes with third-party runes. They run inside a V8 isolate (via `isolated-vm`) with explicit permission grants.

### Installing a plugin

```bash
# Add a marketplace source first
crunes marketplace add https://example.com/marketplace.json
# or a local path for development
crunes marketplace add ./my-plugin/.crunes-plugin

# Install from the marketplace
crunes plugin install my-marketplace@my-plugin
```

### Using a plugin rune

Plugin runes are addressed as `pluginName:runeKey`:

```bash
crunes use my-plugin:some-rune
```

### Plugin manifest (`plugin.json`)

Plugins declare their runes and permissions in `.crunes-plugin/plugin.json`:

```json
{
  "format": "1",
  "name": "my-plugin",
  "version": "1.0.0",
  "dependencies": { "semver": "^7.0.0" },
  "runes": {
    "some-rune": {
      "permissions": {
        "use": {
          "allow": ["fs.read:**", "shell:git log *"]
        }
      }
    }
  }
}
```

### Project-level permission overrides

Narrow or extend a plugin's permissions in `.crunes/config.json`:

```json
{
  "plugins": ["my-plugin"],
  "permissions": {
    "my-plugin:some-rune": {
      "allow": ["fs.read:src/**"],
      "deny": ["shell:*"]
    }
  }
}
```

## CLI Output (`--format md`)

Each section renders as:

```
## {title or name}
[k: v] [k: v]            ← omitted if no attrs
{rendered data}
```

Sections are separated by a blank line.

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for the full version history.

## License

MIT — [Tamerlan Hurbanov (DarkRymit)](https://github.com/darkrymit)
