# rune/api

The `utils` object injected into every rune at runtime. `index.js` assembles the full object from its constituent modules. Full docs: `docs/knowledge-base/modules/rune.md`

## Files

- **index.js** — re-exports `createUtils` and `createSectionUtils` from `utils.js`.
- **utils.js** — `createUtils(dir, checkPermission, pluginDir, permissions, vars, requestedSections, pluginId, projectName)` — assembles and returns `{ utils, dispose }` containing all utility namespaces. `createSectionUtils(patterns)` — returns `{ create, match, selected }` for section filtering.
- **md.js** — Markdown string builders: `h1`–`h3`, `p`, `bold`, `italic`, `code`, `codeBlock`, `ul`, `ol`, `link`, `table`, `blockquote`. Embedded at build time as a source string; runs entirely inside the isolate.
- **tree.js** — Tree node builders and formatters: `node(name, description, children)`, `format(root, options)`. Embedded at build time as a source string; runs entirely inside the isolate.
- **help.js** — `text()` returns the formatted CLI help string for the current rune; `section()` wraps it in a markdown section. Pre-rendered from the rune's `args`/`argsRepl` schema before the isolate starts; returns empty string when no schema is defined.
- **fs.js** — Permission-gated filesystem access: `read`, `resolve`, `exists`, `glob`, `write`, `copy`, `remove`, `move`, `stat`, `mkdir`, `readAsBytes`, `writeAsBytes`, `append`, `appendAsBytes`, `chmod`, `readStreamIter`, `writeStreamRef`.
- **shell.js** — Permission-gated shell execution. `exec(cmd, opts?)` runs a command and returns `{ stdout, stderr, exitCode, ok }`. `spawn(cmd, opts?)` returns a `ShellSession` with Node-like streams: `write`, `kill`, `terminate` and event handlers for stdout/stderr/exit/error. `createShellJob(cmd, opts, jobContext)` spawns a background shell job; on Unix it uses `detached: true` so the shell is a process group leader (enabling group kill), on Windows it uses `detached: false` with `windowsHide: true` (tree kill is handled by `taskkill /F /T`).
- **json.js** — JSON file access with JSONPath: `read`, `readPath`, `readPathAll`, `write`, `modify`.
- **yaml.js** — YAML file access with comment-preserving round-trips: `read`, `write`, `modify`.
- **xml.js** — XML file access (`@_` attribute prefix, `#comment` comments): `read`, `write`, `modify`.
- **http.js** — Permission-gated HTTP client and server. `fetch(url, opts?)` mirrors the Web Fetch API (also available as global `fetch()` inside runes). `server(port, opts?)` creates an `HttpServerSession` with `open`, `close`, `setHandler`, `_registerWsSession`, `_handleUpgrade`. `compilePath(path)` compiles a path pattern to a named-group regex.
- **ws.js** — Permission-gated WebSocket client and server. `client(url, options)` creates a `WsSession` (open, sendText, sendBinary, close, terminate). `server(portOrHttpSession, opts)` creates a `WsServerSession` with `open`, `getConn`, `close`, `terminate`; each connection is a `WsServerConnSession`. `dispose()` closes all sessions.
- **env.js** — Permission-gated env var access from `process.env` or `.env` files: `read(key, fallback)`, `has(key)`.
- **vars.js** — Static key/value vars injected per-rune from project config: `read(key, fallback)`, `has(key)`.
- **archive.js** — Compression: `unzip`, `zip`, `untar`, `tar`, `zipStream`, `unzipStream`, `tarStream`, `untarStream`.
- **cache.js** — Persistent key-value cache (JSON files on disk): `openHandle(location, name)` → `{ set, get, delete, clear }`. Exposed to runes as `cache.open(...)`.
- **sqlite.js** — SQLite databases via `better-sqlite3`: `openHandle(location, name)` → `{ query, get, exec, close }`. `dispose()` closes all open handles. Exposed to runes as `sqlite.open(...)`.
- **db.js** — Permission-gated external database client: `connect(connectionString)` → driver with `query`, `get`, `exec`, `close`. Supports PostgreSQL (`PostgresDriver`) and MySQL (`MySqlDriver`). `dispose()` closes all connections. Exposed to runes as `db.connect(...)`.
- **codec.js** — Encoding/decoding utilities: `toHex`, `fromHex`, `toBase64`, `fromBase64`, `fromUtf8`, `toUtf8`. Exposed to runes as `codec`.
- **crypto.js** — Cryptographic utilities: `hash`, `hashAsHex`, `hashAsBase64`, `hmac`, `hmacAsHex`, `hmacAsBase64`, `encrypt`, `decrypt`, `uuid`, `randomHex`, `randomBase64`, `randomBytesFn`.
- **args-parser.js** — `parseArgs(rawArgs, schema)`, `buildYargsConfig(schema)`, `mapPositionals(parsed, positionals, offset)`, `parseFlags(flagStr)` — converts a rune's `args()` schema into a yargs-parser config and runs the parser. Called by `isolation/runner.js` before invoking `run(parsedArgs)`.

**Sandbox globals:** `setTimeout`, `clearTimeout`, `setInterval`, `clearInterval`, `TextEncoder`, `TextDecoder`, `TextEncoderStream`, `TextDecoderStream`, `AbortController`, `AbortSignal`, `Blob`, `Headers`, `FormData`, `URLSearchParams`, `Request`, `ReadableStream`, `WritableStream`, `TransformStream`, and `fetch` are available on `globalThis` inside every rune without any import. All other utilities — including `help` — must be imported from `@utils`.

## Related Modules

- `rune/permissions` — All permission checks are delegated here at construction time.
- `rune/isolation` — Receives the assembled utils object to proxy inside the isolate via bootstrap stubs (`utils-bootstrap.js`).
