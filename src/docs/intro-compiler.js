import utilsApiData from './generated/utils-api.json' assert { type: 'json' }
import lifecycleApiData from './generated/lifecycle-api.json' assert { type: 'json' }
import globalsApiData from './generated/globals-api.json' assert { type: 'json' }
import { walk } from './ts-walker.js'
import { formatNode, formatMembers } from './ts-formatter.js'

const NAMESPACE_RECIPES = {
  fs: `\`\`\`javascript
import { fs, section } from '@utils'

export async function run() {
  // Read and write files relative to the project root
  const content = await fs.read('src/components/Button.jsx');
  await fs.write('dist/output.txt', 'Hello Sandbox!');
  return [
    section.create('fs-result', {
      type: 'markdown',
      content: 'File written successfully!'
    })
  ];
}
\`\`\``,
  ws: `\`\`\`javascript
import { http, ws, time, section } from '@utils'

export async function run() {
  // --- Client usage ---
  const socket = ws.client('ws://localhost:8080')
  const messages = []
  socket.on('message', (msg) => { messages.push(msg) })
  await socket.open()
  await socket.sendText(JSON.stringify({ type: 'PING' }))
  await time.after(500)
  await socket.close()

  // --- Server usage (piggyback on http.server) ---
  const srv = http.server(0)                              // OS-assigned port, loopback only
  srv.on('request', (req) => new Response('ok'))

  const jobs = ws.server(srv, { path: '/jobs' })          // path routing
  const logs = ws.server(srv, { path: '/logs/:jobId' })   // named path param

  jobs.on('connection', (conn) => {
    conn.on('message', (msg) => conn.sendText(\`echo: \${msg}\`))
  })

  logs.on('connection', (conn) => {
    const jobId = conn.pathParams.get('jobId')            // named param extraction
    conn.sendText(\`streaming logs for job \${jobId}\`)
    conn.on('close', () => {})
  })

  await srv.open()
  await jobs.open()
  await logs.open()
  await time.after(5_000)
  await logs.close()
  await jobs.close()
  await srv.close()

  return [section.create('ws-result', { type: 'markdown', content: messages.join('\\n') })]
}
\`\`\``,
  sqlite: `\`\`\`javascript
import { sqlite, crypto, section } from '@utils'

export async function run() {
  // Scoped SQLite operations
  const db = await sqlite.open('@local-sqlite', 'my-database');
  await db.exec('CREATE TABLE IF NOT EXISTS logs (id TEXT PRIMARY KEY, msg TEXT)');
  await db.exec('INSERT INTO logs VALUES (?, ?)', [crypto.uuid(), 'Rune executed!']);
  const rows = await db.query('SELECT * FROM logs');
  await db.close();

  return [
    section.create('db-logs', {
      type: 'markdown',
      content: rows.map(r => \`- [\${r.id}]: \${r.msg}\`).join('\\n')
    })
  ];
}
\`\`\``,
  http: `\`\`\`javascript
import { http, section } from '@utils'

export async function run() {
  // --- Client: fetch ---
  const res = await http.fetch('https://api.github.com/repos/darkrymit/crunes')
  const repo = await res.json()

  // --- Server: loopback HTTP + WebSocket piggyback ---
  const srv = http.server(0)   // loopback, OS-assigned port — no permission needed
  srv.on('request', (req) => {
    if (req.method === 'GET' && req.pathname === '/health')
      return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } })
    return new Response('Not Found', { status: 404 })
  })
  await srv.open()
  // use srv.port here ...
  await srv.close()

  return [
    section.create('result', {
      type: 'markdown',
      content: \`**Repo**: \${repo.description}\\n**Server port was**: \${srv.port}\`
    })
  ]
}
\`\`\``,
  cache: `\`\`\`javascript
import { cache, section } from '@utils'

export async function run() {
  const projectCache = await cache.open('@local-cache');
  await projectCache.set('last-run', Date.now(), 60); // 60s TTL
  const lastRun = await projectCache.get('last-run');
  return [
    section.create('cache-result', {
      type: 'markdown',
      content: \`Last run timestamp: \${lastRun}\`
    })
  ];
}
\`\`\``,
  shell: `\`\`\`javascript
import { shell, section } from '@utils'

export async function run() {
  // Run command relative to the project directory.
  // { throw: false } returns { stdout, stderr, exitCode, ok } instead of throwing on a non-zero exit.
  const result = await shell.exec('git status --short', { throw: false });
  if (!result.ok) {
    return section.create('git-status', {
      type: 'markdown',
      content: \`Failed (exit \${result.exitCode}): \${result.stderr}\`
    });
  }
  return section.create('git-status', {
    type: 'markdown',
    content: \`\\\`\\\`\\\`\\n\${result.stdout}\\n\\\`\\\`\\\`\`
  });
}
\`\`\``
}

export async function compileIntro() {
  const namespaces = walk(utilsApiData)

  const lines = []

  // Title
  lines.push('# Crunes: Fast Sandboxed Scripting & Context Framework')
  lines.push('')
  lines.push('Crunes is designed as a way to rapidly draft useful scripts inside a project workspace, primarily utilized by AI coding agents to perform repeatable complex tasks such as context ingestion, application interaction, orchestration, and sandboxed file/command execution.')
  lines.push('')

  // Section 1: Anatomy of a Rune
  lines.push('## 1. Anatomy of a Rune')
  lines.push('')
  lines.push('Crunes execute inside an isolated sandbox (`isolated-vm`). Runes are ESM modules with two primary execution modes: **run** (one-shot) and **repl** (interactive session).')
  lines.push('')
  lines.push('Scaffold a new rune with `crunes create`. In non-interactive/agent sessions `--format` is required (no default); `--path` defaults to `.crunes/runes/<key>.rune.js` if omitted — the `.rune.js` suffix is what runs a file in the isolate. `-y`/`--yes` is a global flag, so it goes **before** the subcommand:')
  lines.push('```bash')
  lines.push('crunes -y create my-rune --format markdown')
  lines.push('```')
  lines.push('')
  lines.push('`crunes create` does not write a `permissions` block. Grants live in `.crunes/config.json` under `runes.<key>.run.permissions.allow` — not in the rune file — so add them there once you know what the rune touches (section 3).')
  lines.push('')
  lines.push('**Run mode** \u2014 export `args` to declare a schema and `run` to execute. `--help`/`-h` is NOT intercepted by `crunes run` \u2014 declare it yourself and check it at the top of `run(args)`, as shown below. This example also shows `args(builder)` reading `vars` at schema-build time to compute a dynamic option (`--profile`), a common pattern for anything with a "profile"/"environment" concept:')
  lines.push('')
  lines.push('```javascript')
  lines.push('import { vars, rune } from \'@utils\'')
  lines.push('')
  lines.push('export function args(builder) {')
  lines.push('  const profiles = vars.read(\'deploy_profiles\', [\'staging\', \'production\'])')
  lines.push('  return builder')
  lines.push('    .option(\'-h, --help\', \'Show help\')')
  lines.push('    .option(\'--profile <name>\', `Deployment profile (${profiles.join(\'|\')})`, profiles[0])')
  lines.push('    .option(\'--verbose\', \'Verbose output\', false)')
  lines.push('    .command(\'remote\', \'Manage git remotes\', remote => {')
  lines.push('      remote.command(\'add\', \'Add a remote\', add => {')
  lines.push('        add.positional(\'<name>\', \'Remote name\')')
  lines.push('           .positional(\'<url>\', \'Remote URL\')')
  lines.push('      })')
  lines.push('    })')
  lines.push('}')
  lines.push('')
  lines.push('export async function run(args) {')
  lines.push('  if (args.help) return rune.helpSection()')
  lines.push('  if (args.$command === \'remote add\') {')
  lines.push('    return `Adding remote ${args.name} at ${args.url}`')
  lines.push('  }')
  lines.push('}')
  lines.push('```')
  lines.push('')
  lines.push('**repl mode** \u2014 export `repl` + `inputRepl` for an interactive session. The isolate stays alive across inputs; use module-level variables as session state:')
  lines.push('')
  lines.push('```javascript')
  lines.push('import { section, md } from \'@utils\'')
  lines.push('')
  lines.push('let count = 0')
  lines.push('')
  lines.push('export async function repl() { return \'counter> \' }')
  lines.push('')
  lines.push('export async function inputRepl(input) {')
  lines.push('  if (input.type === \'eof\') return { type: \'done\' }')
  lines.push('  if (input.type === \'line\' && input.text === \'inc\')')
  lines.push('    section.emit(section.create(\'result\', { type: \'markdown\', content: md.p(`count: ${++count}`) }))')
  lines.push('}')
  lines.push('```')
  lines.push('')
  lines.push('### Import System')
  lines.push('')
  lines.push('- **`from \'@utils\'`** \u2014 The standard utility namespace. Always available.')
  lines.push('- **`from \'./relative\'`** \u2014 Relative imports. Always available. Resolves relative to the current rune file.')
  lines.push('- **`from \'@project/path\'`** \u2014 Import from the project root. Requires `fs.read:<path>` permission.')
  lines.push('- **`from \'@plugin/path\'`** \u2014 Plugin runes only. Resolves from the plugin\'s own root directory.')
  lines.push('- **`from \'node:fs\'` / `node:path` / etc.** \u2014 Always blocked. Use the `@utils` equivalents instead.')
  lines.push('')

  // Section 2: CLI Calling & Argument Conventions
  lines.push('## 2. CLI Calling & Argument Conventions')
  lines.push('')
  lines.push('Crunes enforces a strict 3-tier boundary when executing runes via the CLI. Misplacing flags will cause the parser to fail or misinterpret the arguments.')
  lines.push('')
  lines.push('### The Strict 3-Tier Parsing Boundary')
  lines.push('All command invocations must follow this structural order exactly:')
  lines.push('1. **Global Flags**: Options parsed by the core process (e.g. `--cwd <path>`, `-p` for plain output, `--verbose`).')
  lines.push('2. **Command Flags**: Options parsed by the `run` command (e.g. `-b` / `--batch`, `--fail-fast`, `--format json`).')
  lines.push('3. **Rune Arguments**: Config and positional values passed directly to the execution sandbox.')
  lines.push('')
  lines.push('```bash')
  lines.push('# Correct Flag Placement')
  lines.push('crunes --cwd ./project -p run --format json greeting "Alice"')
  lines.push('```')
  lines.push('')
  lines.push('> [!WARNING]')
  lines.push('> Placing a global flag after `run` (e.g. `crunes run --cwd ./project`) causes an instant error.')
  lines.push('')
  lines.push('> [!WARNING]')
  lines.push('> `--help`/`-h` are NOT intercepted by `crunes run` — if a rune does not declare its own help option and check it inside `run(args)`, an unrecognized `--help` is silently ignored and the rune executes for real. Use `crunes docs rune <key>` to preview a rune\'s CLI surface without executing it.')
  lines.push('')
  lines.push('### Bracket Syntax (Segment-Level Flags)')
  lines.push('Section filters are embedded directly in the rune key using bracket syntax: `key[-s section]`. This is the only supported way to filter sections — placing `-s` before or after the key does not work.')
  lines.push('')
  lines.push('```bash')
  lines.push('# CORRECT: section filter in brackets, rune args follow after the key token')
  lines.push('crunes run api[-s endpoints] v2')
  lines.push('')
  lines.push('# INCORRECT: -s before the key is rejected as a misplaced flag')
  lines.push('crunes run -s endpoints api v2')
  lines.push('')
  lines.push('# INCORRECT: -s after the key is passed as a raw rune arg, not a section filter')
  lines.push('crunes run api v2 --section endpoints')
  lines.push('```')
  lines.push('')
  lines.push('Bracket content is whitespace-tokenized and parsed for segment flags only. Rune arguments still go after the full `key[...]` token as usual.')
  lines.push('')
  lines.push('### Custom Commands & Nested Parameters Mapping')
  lines.push('Runes can recursively nest commands using \`.command()\` on the builder. Inside \`run(args)\`, Crunes automatically exposes:')
  lines.push('- **\`args.$command\`**: The space-separated matched command path string (e.g. \`"remote add"\`).')
  lines.push('- **\`args.$commands\`**: The matched command path levels array (e.g. \`["remote", "add"]\`).')
  lines.push('- **\`args._\`**: Data positionals only — command tokens are stripped, so \`args._[0]\` is always the first user-supplied value after the matched command.')
  lines.push('- **Named Positionals**: Parameters like \`<name>\` or \`[scope]\` are automatically mapped to \`args.name\` or \`args.scope\`.')
  lines.push('- An unrecognized subcommand does not populate `$command` — it falls through to the root (`$command === \'\'`) with the unmatched token in `$rest`. To report "unknown command," check `args.$command === \'\' && args.$rest.length > 0`.')
  lines.push('')
  lines.push('### Batched Executions')
  lines.push('Multiple runes can be run sequentially in one invocation using the `+` operator (requires the `-b` / `--batch` command flag). Bracket syntax is especially useful in batch mode — each segment carries its own filters:')
  lines.push('```bash')
  lines.push('# Each segment has its own section filter via brackets')
  lines.push('crunes run -b api[-s endpoints] + greeting[-s summary] "World"')
  lines.push('```')
  lines.push('')

  // Section 3: Configuration Reference
  lines.push('## 3. Configuration Reference')
  lines.push('')
  lines.push('Configuration properties in `.crunes/config.json` control permissions, default variables, mappings, and plugin registration.')
  lines.push('')
  lines.push('`crunes init` also scaffolds a `.crunes/.gitignore` covering local-only files (`config.local.json`, `project.local.json`) and generated directories (`logs/`, `caches/`, `schemas/`, `sqlite/`, `jobs/`) — only `config.json` and your rune `.rune.js` files need to be committed.')
  lines.push('')
  lines.push('### Sandbox Security & Permissions')
  lines.push('Runes do not have direct access to Node.js APIs. A rune entry names its module in a `run` block, and the grants for it inside that block in `.crunes/config.json`. Nothing is found by convention: a rune runs only the module its entry names.')
  lines.push('```json')
  lines.push('{')
  lines.push('  "runes": {')
  lines.push('    "my-rune": {')
  lines.push('      "name": "My Rune",')
  lines.push('      "description": "Does something useful",')
  lines.push('      "vars": { "api_url": "https://example.com" },')
  lines.push('      "run": {')
  lines.push('        "command": ".crunes/runes/my-rune.rune.js",')
  lines.push('        "permissions": { "allow": ["fs.read:src/**", "fs.write:dist/**", "shell.run:git *"] }')
  lines.push('      }')
  lines.push('    }')
  lines.push('  }')
  lines.push('}')
  lines.push('```')
  lines.push('')
  lines.push('A rune has a REPL only when its entry declares a `repl` block, with its own grants — `repl` does not inherit from `run`:')
  lines.push('```json')
  lines.push('{')
  lines.push('  "runes": {')
  lines.push('    "my-shell": {')
  lines.push('      "run":  { "command": ".crunes/runes/my-shell.rune.js", "permissions": { "allow": ["sqlite.read:./state::db"] } },')
  lines.push('      "repl": { "command": ".crunes/runes/my-shell.rune.js", "permissions": { "allow": ["sqlite.read:./state::db", "sqlite.write:./state::db"] } }')
  lines.push('    }')
  lines.push('  }')
  lines.push('}')
  lines.push('```')
  lines.push('A block written as a string is shorthand for `{ "command": … }`. An entry in the old shape — `path`, `permissions.run`, or none at all relying on `.crunes/runes/<key>.js` — is refused; `crunes migrate` rewrites every entry and renames the modules (`crunes migrate --plugin <dir>` does the same for a plugin manifest).')
  lines.push('')
  lines.push('To grant a **plugin** rune extra permissions or vars from the project side (plugin runes have no `runes.<key>` entry of their own), add an entry keyed by the fully-qualified `"marketplace@plugin:runeKey"` string — **this must always be the full form, never the bare plugin name**, since two enabled plugins could share a bare name and a bare-form key can never resolve to anything (config loading rejects a bare-form key outright).')
  lines.push('```json')
  lines.push('{')
  lines.push('  "plugins": { "my-market@my-plugin": true },')
  lines.push('  "runes": {')
  lines.push('    "my-market@my-plugin:deploy": {')
  lines.push('      "vars": { "region": "us-east-1" },')
  lines.push('      "permissions": {')
  lines.push('        "run": { "allow": ["fs.read:src/**"] }')
  lines.push('      }')
  lines.push('    }')
  lines.push('  }')
  lines.push('}')
  lines.push('```')
  lines.push('')
  lines.push('### Disambiguating Same-Named Plugins')
  lines.push('If two enabled plugins from different marketplaces happen to share a bare name, `crunes run <name>:<rune>` (and `repl`, and `docs rune`) needs the fully-qualified `marketplace@plugin:rune` form to pick one — e.g. `crunes run my-org@git:status` instead of the ambiguous `crunes run git:status`. An ambiguity error always lists the full keys to use.')
  lines.push('')
  lines.push('A rune entry can also give a specific plugin rune its own project-local name and `vars`/`permissions` preset, by aliasing to it directly — useful any time you want a memorable name for one particular configuration of a plugin rune (e.g. a `deploy-staging` and `deploy-prod` entry both aliasing the same underlying rune with different `vars`). Disambiguating a same-named collision permanently is one example use of this:')
  lines.push('```json')
  lines.push('{')
  lines.push('  "runes": {')
  lines.push('    "git": { "plugin": "my-org@git:status" }')
  lines.push('  }')
  lines.push('}')
  lines.push('```')
  lines.push('Now `crunes run git` always resolves to that specific plugin rune, with no ambiguity, regardless of what else is enabled.')
  lines.push('')
  lines.push('### Script Runes')
  lines.push('A rune can also be a Node, Python or bash script, or a program on `PATH`. Its `run` block names the script instead of a `*.rune.js` module — `crunes add <key> <command>` writes one:')
  lines.push('```json')
  lines.push('{')
  lines.push('  "runes": {')
  lines.push('    "coverage": { "description": "Coverage per module", "run": "tools/coverage.py", "args": ".crunes/runes/coverage.args.rune.js" },')
  lines.push('    "log":      { "description": "Recent commits", "run": { "command": "git", "argv": ["log", "--oneline", "-n", "20"] } },')
  lines.push('    "api":      { "run": { "command": ".crunes/runes/api.rune.js", "permissions": { "allow": ["fs.read:src/**"] } } }')
  lines.push('  }')
  lines.push('}')
  lines.push('```')
  lines.push('- **`run.command`** is resolved like a shell resolves a command: a value with a path separator, a leading `.`, or an absolute path is a file relative to the config layer; a bare name is a program on `PATH`. A file name selects the runtime: `*.rune.js` runs in the isolate, `.js`/`.mjs`/`.cjs` with Node, `.py` with Python (`CRUNES_PYTHON`, the active virtualenv, a project `.venv/` or `venv/`, then `python3`/`python`), `.sh` with bash; anything else is executed directly. `run.argv` is placed before the caller\'s arguments.')
  lines.push('- **Script runes run natively, with full access** — `run.permissions` is only accepted for a `*.rune.js` module. `crunes list` marks them `native`; `crunes doctor` reports the interpreter each one resolves to.')
  lines.push('- **`args`** documents and parses a script\'s arguments: crunes answers `--help`, `crunes docs rune` shows the schema, and the script receives the parsed result as JSON in `CRUNES_ARGS` alongside the raw arguments. It is a JSON schema — written inline, or in a `.json` file — or a `*.rune.js` module whose `args(builder)` export builds one. In a JSON schema, an option takes `default`, `required` and `choices`, and a positional takes `choices`; crunes refuses a call that is missing a required argument or uses a value outside its choices before the script starts. Without an `args` block, arguments pass through unchanged.')
  lines.push('```json')
  lines.push('"args": {')
  lines.push('  "positionals": [{ "spec": "<module>", "description": "Module to report on", "choices": ["auth", "billing"] }],')
  lines.push('  "options": [{ "flags": "--min <percent>", "description": "Fail below this", "default": "0" }]')
  lines.push('}')
  lines.push('```')
  lines.push('- **`run.output: "sections"`** lets a script print named sections: each standard-output line shaped like a `--format jsonl` section event — `{"type":"section","section":{"name":"summary","data":{"type":"markdown","content":"…"}}}` — becomes a section as soon as it is printed, filterable with `-s`; any other line is plain text. Run on its own, a script\'s sections print as markdown; in a batch or JSONL they are labelled like any rune\'s.')
  lines.push('- **`crunes create --lang python|bash|node <key>`** scaffolds a script rune; `crunes add <key> <command>` registers one that already exists.')
  lines.push('- **Run on its own, a script rune gets the caller\'s terminal and standard streams and returns its own exit code.** In a batch, `--format jsonl` or `rune.exec`, its standard output is captured as an `output` section and a non-zero exit fails it. Every script also receives `CRUNES_PROJECT_ROOT`, `CRUNES_RUNE_KEY`, `CRUNES_LIFECYCLE`, and `CRUNES_VARS` — the rune\'s configured `vars` as a JSON object.')
  lines.push('')
  lines.push('### Config File Fields Reference')
  lines.push('- **`runes`**: Definition of project-registered runes, keyed by rune key (or the fully-qualified `"marketplace@plugin:runeKey"` string for a plugin-rune override — never a bare plugin name). Each entry declares a `run` block (and optionally `args` — see Script Runes — and `repl`), `name`, `description` and `vars` (key-value settings read via `utils.vars.read(key)`); or `plugin` (an alias to a specific plugin rune, see above). Grants live inside the `run` and `repl` blocks as `{ "allow": [...], "deny": [...] }`; a plugin alias or `marketplace@plugin:rune` override may carry blocks with only `permissions`.')
  lines.push('- **`plugins`**: Map of plugin key to a boolean, e.g. `{"my-market@my-plugin": true}`. A legacy array of keys is still read and is converted to map form on the next write. `false` is meaningful: it turns a plugin off in this layer even though a lower layer enabled it.')
  lines.push('- **`templates`**: Definition of registered templates, keyed by template name, merged across layers exactly like `runes`.')
  lines.push('')
  lines.push('### Config Layers')
  lines.push('Configuration merges across three layers, lowest to highest — later layers win per key:')
  lines.push('```')
  lines.push('1. ~/.crunes/config.json          (global — personal, machine-wide)')
  lines.push('2. <project>/.crunes/config.json')
  lines.push('3. <project>/.crunes/config.local.json')
  lines.push('```')
  lines.push('`~/.crunes` **is** the global config directory, so global paths carry no `.crunes/` segment: a global rune\'s module is written `runes/<key>.rune.js` and lives at `~/.crunes/runes/<key>.rune.js`. Each layer resolves its own files before merging, so a project can override one field of a global rune and still load the global file:')
  lines.push('```json')
  lines.push('// ~/.crunes/config.json')
  lines.push('{ "runes": { "serve": { "run": "runes/serve.rune.js", "vars": { "port": 3000 } } } }')
  lines.push('')
  lines.push('// <project>/.crunes/config.json — same rune, different port')
  lines.push('{ "runes": { "serve": { "vars": { "port": 4000 } } } }')
  lines.push('```')
  lines.push('Because `plugins` is a boolean map, a project can also opt out of a globally-enabled plugin — `crunes plugin disable <name>` writes `{"my-market@my-plugin": false}` into the project config, leaving the global enable intact.')
  lines.push('')
  lines.push('`CRUNES_NO_GLOBAL=1` skips the global layer entirely. Set it in CI so a developer\'s personal config can never alter project behavior.')
  lines.push('')
  lines.push('### Rootless Mode')
  lines.push('In a directory with no `.crunes/config.json`, crunes runs **rootless**: the global layer alone applies, and every piece of local state — caches, SQLite databases, job logs, schema caches, `node_modules` — is redirected into the store under `~/.crunes/rootless/<hash-of-cwd>/`. **Nothing is written outside the store.** Running a global rune inside an Obsidian vault or any other directory leaves that directory byte-identical.')
  lines.push('')
  lines.push('`@project/` and permission paths still resolve against the current working directory, which is what makes a generic "serve this directory" rune work from anywhere. **This is also the security property to understand:** a permission granted once in the global config applies in every directory you invoke that rune from. Scope global-rune permissions deliberately.')
  lines.push('')
  lines.push('Running `crunes init` in such a directory turns it into a project — the layer simply appears.')
  lines.push('')
  lines.push('### Global Commands')
  lines.push('`-g` / `--global` targets the global config instead of the project:')
  lines.push('```bash')
  lines.push('crunes init -g                       # create ~/.crunes/config.json')
  lines.push('crunes create -g serve               # write ~/.crunes/runes/serve.rune.js and register it')
  lines.push('crunes plugin install -g mkt@plug    # install and enable everywhere')
  lines.push('crunes plugin enable  -g plug')
  lines.push('crunes plugin disable    plug        # opt this project out of a global enable')
  lines.push('crunes plugin disable -g plug        # turn it off everywhere')
  lines.push('crunes template create -g base       # ~/.crunes/templates/base.js')
  lines.push('crunes list -g                       # global entries only; bare `list` shows the merged set with a Layer column')
  lines.push('```')
  lines.push('')

  // Section 4: Rune Exports API Reference
  lines.push('## 4. Rune Exports API Reference')
  lines.push('')
  lines.push('The sandboxed execution environment parses entrypoint exports to build schemas and run modules safely. Their dynamic type specification is detailed below:')
  lines.push('')
  const [lifecycleNs] = walk(lifecycleApiData)
  lines.push(formatMembers(lifecycleNs?.members ?? [], { indent: '' }))
  lines.push('> **REPL Lifecycle:** Six exports form the interactive lifecycle — `argsRepl`, `repl`, `bannerRepl`, `commandsRepl`, `inputRepl`, `completeInputRepl`. The isolate stays alive across inputs — use JS module-level variables as session state. `repl` requires its own `"repl"` permission block in `config.json`; it does not inherit from `"run"`. See `crunes docs repl`, `crunes docs input-repl`, and related commands for the full reference.')
  lines.push('')

  // Section 5: Global Sandbox APIs
  lines.push('## 5. Global Sandbox APIs')
  lines.push('')
  const [globalsNs] = walk(globalsApiData)
  lines.push(formatMembers(globalsNs?.members ?? [], { indent: '' }))
  lines.push('')

  // Section 6: Dynamic @utils Reference
  lines.push('## 6. Dynamic `@utils` Reference')
  lines.push('')
  lines.push('The following utility namespaces are available to runes in the execution isolate:')
  lines.push('')

  for (const ns of namespaces) {
    lines.push(`### \`${ns.name}\``)
    lines.push('')
    if (ns.description) {
      lines.push(ns.description)
      lines.push('')
    }

    if (NAMESPACE_RECIPES[ns.name]) {
      lines.push('**Usage Example:**')
      lines.push(NAMESPACE_RECIPES[ns.name])
      lines.push('')
    }

    lines.push(formatNode(ns))
    lines.push('')
    lines.push('---')
    lines.push('')
  }

  return lines.join('\n')
}
