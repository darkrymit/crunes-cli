# marketplace

Plugin marketplace source management: add, remove, list, and search marketplace source URLs; browse and refresh cached plugin indexes. Full docs: `docs/knowledge-base/modules/marketplace.md` (pending)

## Key Files

- **marketplace.js** — Source URL persistence and cached index management. `resolveFromMarketplace(name)` looks up a plugin by name across all configured marketplace sources; used by plugin install and update flows.

## Sub-directories

- **commands/** — CLI handlers: `add`, `remove`, `list`, `search`, `update`, `browse`.

## Related Modules

- `plugin` — `plugin install` and `plugin update` call `resolveFromMarketplace` to locate plugin source URLs from marketplace indexes.
