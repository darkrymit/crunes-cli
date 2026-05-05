# rune/api

The `utils` object injected into every rune at runtime. `index.js` assembles the full object from its constituent modules. Full docs: `docs/knowledge-base/modules/rune.api.md` (pending)

## Key Files

- **index.js** — `createUtils(context)` — assembles and returns the full utils object passed into each rune's `use(dir, args, utils)` call.
- **md.js** — Markdown string builders: `h1`–`h3`, `bold`, `ul`, `ol`, `table`, `code`, `fence`, etc. Embedded at build time as a source string.
- **tree.js** — Tree node builders and formatters (tree-style and list-style output). Embedded at build time as a source string.
- **fs.js** — Permission-gated filesystem access: `read`, `exists`, `glob`.
- **shell.js** — Permission-gated shell execution + `ShellError`.
- **json.js** — JSON file queries with JSONPath + `JsonParseError`.
- **fetch.js** — Permission-gated HTTP client (mirrors Web Fetch API) + `FetchError`.
- **env.js** — Permission-gated env var access (`process.env` + `.env` files via dotenv + micromatch).
- **vars.js** — Static key/value vars injected per-rune from project config.

## Related Modules

- `rune/permissions` — All permission checks are delegated here at construction time.
- `rune/isolation` — Receives the assembled utils object to proxy inside the isolate via bootstrap stubs.
