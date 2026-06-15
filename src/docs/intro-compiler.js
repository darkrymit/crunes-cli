import utilsApiData from './generated/utils-api.json' assert { type: 'json' }
import lifecycleApiData from './generated/lifecycle-api.json' assert { type: 'json' }
import globalsApiData from './generated/globals-api.json' assert { type: 'json' }
import { walk } from './ts-walker.js'
import { formatNode, formatMembers } from './ts-formatter.js'
import { getRune } from '../rune/resolver.js'
import { getArgsSchema } from '../rune/isolation/runner.js'
import { formatHelp } from './formatter.js'
import { computeEffectivePermissions } from '../rune/permissions/permissions.js'
import { resolve } from 'node:path'

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
  // Run command relative to the project directory
  const stdout = await shell.exec('git status --short');
  return [
    section.create('git-status', {
      type: 'markdown',
      content: \`\\\`\\\`\\\`\\n\${stdout}\\n\\\`\\\`\\\`\`
    })
  ];
}
\`\`\``
}

export async function compileIntro({ config, format, projectRoot, configRoot, hasProjectError }) {
  const namespaces = walk(utilsApiData)

  const activeRunes = []
  if (config && !hasProjectError) {
    const runesList = Object.entries(config.runes ?? {})
    for (const [key, entry] of runesList) {
      const runeFile = resolve(configRoot, entry.path ?? `.crunes/runes/${key}.js`)
      const basePerms = entry.permissions ?? { allow: [], deny: [] }
      const effective = computeEffectivePermissions(basePerms, config.permissions?.[key], 'args')

      let schema = null
      let schemaError = null
      try {
        schema = await getArgsSchema(runeFile, effective, projectRoot, { vars: entry.vars ?? {} })
      } catch (err) {
        schemaError = err.message
      }

      activeRunes.push({
        key,
        name: entry.name ?? key,
        description: entry.description ?? null,
        path: entry.path ?? `.crunes/runes/${key}.js`,
        permissions: entry.permissions ?? { allow: [], deny: [] },
        schema,
        schemaError,
      })
    }
  }

  if (format === 'json') {
    return JSON.stringify(
      {
        ecosystem: {
          namespaces,
        },
        workspace: config
          ? {
              projectRoot,
              configRoot,
              runes: activeRunes,
              plugins: config.plugins ?? [],
            }
          : null,
        error: hasProjectError ?? null,
      },
      null,
      2
    )
  }

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
  lines.push('**Run mode** \u2014 export `args` to declare a schema and `run` to execute:')
  lines.push('')
  lines.push('```javascript')
  lines.push('export function args(builder) {')
  lines.push('  return builder')
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
  lines.push('### Sandbox Security & Permissions')
  lines.push('Runes do not have direct access to Node.js APIs. They declare specific lifecycle-scoped permission scopes in `.crunes/config.json`:')
  lines.push('```json')
  lines.push('{')
  lines.push('  "runes": {')
  lines.push('    "my-rune": {')
  lines.push('      "name": "My Rune",')
  lines.push('      "description": "Does something useful",')
  lines.push('      "path": ".crunes/runes/my-rune.js",')
  lines.push('      "vars": { "api_url": "https://example.com" }')
  lines.push('    }')
  lines.push('  },')
  lines.push('  "permissions": {')
  lines.push('    "my-rune": {')
  lines.push('      "run": { "allow": ["fs.read:src/**", "fs.write:dist/**", "shell.run:git *"] }')
  lines.push('    }')
  lines.push('  }')
  lines.push('}')
  lines.push('```')
  lines.push('')
  lines.push('For runes that use both `run` and `repl`, declare both permission namespaces separately — `repl` does not inherit from `run`:')
  lines.push('```json')
  lines.push('{')
  lines.push('  "runes": {')
  lines.push('    "my-shell": {')
  lines.push('      "permissions": {')
  lines.push('        "run":     { "allow": ["sqlite.read:./state::db"] },')
  lines.push('        "repl":    { "allow": ["sqlite.read:./state::db", "sqlite.write:./state::db"] }')
  lines.push('      }')
  lines.push('    }')
  lines.push('  }')
  lines.push('}')
  lines.push('```')
  lines.push('')
  lines.push('### Config File Fields Reference')
  lines.push('- **`permissions`**: Mappings of permission templates scoped to specific runes.')
  lines.push('- **`runes`**: Definition of project-registered runes, containing local filesystem paths, pre-declared vars, and metadata.')
  lines.push('- **`vars`**: Key-value settings scoped to specific runes (accessible inside the isolate via `utils.vars.read(key)`).')
  lines.push('- **`plugins`**: Mappings of enabled third-party marketplaces or plugins.')
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
