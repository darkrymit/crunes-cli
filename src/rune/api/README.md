# rune/api

The `utils` object injected into every rune at runtime. `index.js` assembles the full object from its constituent modules. Full docs: `docs/knowledge-base/modules/rune.md`

## Key Files

- **index.js** — `createUtils(context)` — assembles and returns the full utils object; each property corresponds to one of the modules below.
- **md.js** — Markdown string builders: `h1`–`h3`, `p`, `bold`, `italic`, `code`, `codeBlock`, `ul`, `ol`, `link`, `table`. Embedded at build time as a source string; runs entirely inside the isolate.
- **tree.js** — Tree node builders and formatters (`node`, `format`). Embedded at build time as a source string; runs entirely inside the isolate.
- **fs.js** — Permission-gated filesystem access: `read`, `exists`, `glob`, `write`, `copy`. (`replace` is a composite implemented in `utils-bootstrap.js`.)
- **shell.js** — Permission-gated shell execution + `ShellError`.
- **json.js** — JSON file access with JSONPath: `read`, `get`, `getAll`, `write`, `modify`. (`modify` is implemented in `utils-bootstrap.js`.)
- **yaml.js** — YAML file access with comment-preserving round-trips: `read`, `write`, `modify`. (`modify` is implemented in `utils-bootstrap.js`.)
- **xml.js** — XML file access (`@_` attribute prefix, `#comment` comments): `read`, `write`, `modify`. (`modify` is implemented in `utils-bootstrap.js`.)
- **fetch.js** — Permission-gated HTTP client (mirrors Web Fetch API) + `FetchError`.
- **env.js** — Permission-gated env var access from `process.env` or `.env` files: `get`, `has`.
- **vars.js** — Static key/value vars injected per-rune from project config: `get`, `has`.
- **archive.js** — Compression: `unzip`, `zip`, `untar`, `tar`.
- **cache.js** — Persistent key-value cache (JSON files on disk): `openHandle(location, name)` → `{ set, get, delete, clear }`. Exposed to runes as `cache.open(...)`.
- **sqlite.js** — SQLite databases via `better-sqlite3`: `openHandle(location, name)` → `{ query, get, exec, close }`. Exposed to runes as `sqlite.open(...)`.
- **crypto.js** — Cryptographic utilities: `hashHex`, `hashBase64`, `uuid`, `hex`, `base64`.
- **utils.js** — Internal helpers: `resolvePath`, `canonicalizeLocation`, `getAutoPermits`, `getProjectKey`. Handles virtual location tokens (`@project/`, `@plugin/`, `@project-cache`, `@project-sqlite`, etc.).
- **args-parser.js** — `parseArgs(rawArgs, schema)`, `buildYargsConfig(schema)`, `parseFlags(flagStr)` — converts the schema produced by a rune's `args()` export into a yargs-parser config and runs the parser. Called by `isolation/runner.js` before invoking `use(parsedArgs)`.

## Related Modules

- `rune/permissions` — All permission checks are delegated here at construction time.
- `rune/isolation` — Receives the assembled utils object to proxy inside the isolate via bootstrap stubs (`utils-bootstrap.js`).
