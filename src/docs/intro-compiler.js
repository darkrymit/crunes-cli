import utilsApiData from './generated/utils-api.json' assert { type: 'json' }
import lifecycleApiData from './generated/lifecycle-api.json' assert { type: 'json' }
import globalsApiData from './generated/globals-api.json' assert { type: 'json' }
import { walkUtilsDocs } from './utils-walker.js'
import { formatUtilsNamespace } from './utils-formatter.js'
import { getRune } from '../rune/resolver.js'
import { getArgsSchema } from '../rune/isolation/runner.js'
import { formatHelp } from './formatter.js'
import { computeEffectivePermissions } from '../rune/permissions/permissions.js'
import { resolve } from 'node:path'

const NAMESPACE_RECIPES = {
  fs: `\`\`\`javascript
import { fs, section } from '@utils'

export async function use() {
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
import { ws, time, section } from '@utils'

export async function use() {
  const socket = ws.client('ws://localhost:8080');
  const messages = [];

  // Register event listeners BEFORE opening
  socket.on('message', (msg) => {
    messages.push(msg);
  });

  await socket.open();
  await socket.sendText(JSON.stringify({ type: 'PING' }));
  
  // Wait a moment for replies, then close
  await time.after(500);
  await socket.close();

  return [
    section.create('ws-replies', {
      type: 'markdown',
      content: messages.map(m => \`- \${m}\`).join('\\n')
    })
  ];
}
\`\`\``,
  sqlite: `\`\`\`javascript
import { sqlite, crypto, section } from '@utils'

export async function use() {
  // Scoped SQLite operations
  const db = await sqlite.open('@local-project-sqlite', 'my-database');
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

export async function use() {
  // Buffered fetch — reads the full body at once
  const res = await http.fetch('https://api.github.com/repos/darkrymit/crunes');
  const repo = await res.json();

  // Streaming fetch — consume body chunk-by-chunk
  const stream = await http.fetch('https://httpbin.org/stream/3');
  const reader = stream.body().getReader();
  const decoder = new TextDecoder();
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(decoder.decode(value, { stream: true }));
  }

  return [
    section.create('result', {
      type: 'markdown',
      content: \`**Repo**: \${repo.description}\\n\\n**Stream chunks**: \${chunks.length}\`
    })
  ];
}
\`\`\``,
  cache: `\`\`\`javascript
import { cache, section } from '@utils'

export async function use() {
  const projectCache = await cache.open('@local-project-cache');
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

export async function use() {
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

function formatLifecycleDocs(data) {
  const lifecycleNs = walkUtilsDocs(data)[0]
  if (!lifecycleNs) return ''

  const lines = []
  lines.push('### Core Entrypoints')
  lines.push('')

  for (const fn of lifecycleNs.functions) {
    const isUse = fn.name === 'use'
    const sigStr = isUse ? 'use(args)' : 'args(builder)'
    lines.push(`#### \`export function ${sigStr}\``)
    lines.push('')
    if (fn.description) lines.push(fn.description)
    lines.push('')
    lines.push('**Parameters:**')
    for (const p of fn.params) {
      lines.push(`- **\`${p.name}\`** (\`${p.type}\`): ${p.description ?? ''}`)
    }
    lines.push('')
    if (fn.returns && fn.returns !== 'void') {
      lines.push(`**Returns:** \`${fn.returns}\``)
      lines.push('')
    }
  }

  lines.push('### Supporting Interfaces')
  lines.push('')

  for (const [typeName, typeDef] of Object.entries(lifecycleNs.types ?? {})) {
    lines.push(`#### Interface: \`${typeName}\``)
    lines.push('')
    if (typeDef.description) lines.push(typeDef.description)
    lines.push('')
    
    if (typeDef.properties?.length) {
      lines.push('| Field | Type | Description |')
      lines.push('| --- | --- | --- |')
      for (const p of typeDef.properties) {
        lines.push(`| \`${p.name}\` | \`${p.type}\` | ${p.description ?? ''} |`)
      }
      lines.push('')
    }

    if (typeDef.methods?.length) {
      lines.push('| Method | Returns | Description |')
      lines.push('| --- | --- | --- |')
      for (const m of typeDef.methods) {
        const params = (m.params ?? []).map(p => `${p.name}${p.optional ? '?' : ''}: ${p.type}`).join(', ')
        lines.push(`| \`${m.name}(${params})\` | \`${m.returns}\` | ${m.description ?? ''} |`)
      }
      lines.push('')
    }
  }

  return lines.join('\n')
}

function formatGlobalsDocs(data) {
  const globalsNs = walkUtilsDocs(data)[0]
  if (!globalsNs) return ''

  const lines = []
  lines.push('The sandbox environment provides standard global utility functions and classes directly on `globalThis`. These are backed by the host bridge and do not require importing from `@utils`:')
  lines.push('')
  lines.push('### Global Functions')
  lines.push('')

  const preferredOrder = ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval']
  const sortedFunctions = [...globalsNs.functions].sort((a, b) => {
    const idxA = preferredOrder.indexOf(a.name)
    const idxB = preferredOrder.indexOf(b.name)
    if (idxA !== -1 && idxB !== -1) return idxA - idxB
    if (idxA !== -1) return -1
    if (idxB !== -1) return 1
    return a.name.localeCompare(b.name)
  })

  for (const fn of sortedFunctions) {
    const paramsSig = fn.params.map(p => `${p.name}${p.optional ? '?' : ''}`).join(', ')
    lines.push(`#### \`function ${fn.name}(${paramsSig})\``)
    lines.push('')
    if (fn.description) lines.push(fn.description)
    lines.push('')
    if (fn.params && fn.params.length > 0) {
      lines.push('**Parameters:**')
      for (const p of fn.params) {
        lines.push(`- **\`${p.name}\`** (\`${p.type}\`): ${p.description ?? ''}`)
      }
      lines.push('')
    }
    if (fn.returns && fn.returns !== 'void') {
      lines.push(`**Returns:** \`${fn.returns}\``)
      lines.push('')
    }
  }

  if (globalsNs.types && Object.keys(globalsNs.types).length > 0) {
    lines.push('### Global Classes and Interfaces')
    lines.push('')
    const sortedTypes = Object.entries(globalsNs.types).sort((a, b) => a[0].localeCompare(b[0]))
    for (const [typeName, typeDef] of sortedTypes) {
      const label = typeDef.kind === 128 ? 'Class' : 'Interface'
      lines.push(`#### ${label}: \`${typeName}\``)
      lines.push('')
      if (typeDef.description) lines.push(typeDef.description)
      lines.push('')
      if (typeDef.properties?.length) {
        lines.push('| Property | Type | Description |')
        lines.push('| --- | --- | --- |')
        for (const p of typeDef.properties) {
          lines.push(`| \`${p.name}\` | \`${p.type}\` | ${p.description ?? ''} |`)
        }
        lines.push('')
      }
      if (typeDef.methods?.length) {
        lines.push('| Method | Returns | Description |')
        lines.push('| --- | --- | --- |')
        for (const m of typeDef.methods) {
          const params = (m.params ?? []).map(p => `${p.name}${p.optional ? '?' : ''}: ${p.type}`).join(', ')
          lines.push(`| \`${m.name}(${params})\` | \`${m.returns}\` | ${m.description ?? ''} |`)
        }
        lines.push('')
      }
    }
  }

  return lines.join('\n')
}

export async function compileIntro({ config, format, projectRoot, configRoot, hasProjectError }) {
  const namespaces = walkUtilsDocs(utilsApiData)
  const globalsTypes = walkUtilsDocs(globalsApiData)[0]?.types ?? {}

  const activeRunes = []
  if (config && !hasProjectError) {
    const runesList = Object.entries(config.runes ?? {})
    for (const [key, entry] of runesList) {
      const runeFile = resolve(configRoot, entry.path ?? `.crunes/runes/${key}.js`)
      const basePerms = entry.permissions ?? { allow: [], deny: [] }
      const effective = computeEffectivePermissions(basePerms, config.permissions?.[key], 'args', configRoot)

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
  lines.push('Crunes execute inside an isolated sandbox (`isolated-vm`). Runes are ESM modules exporting a `use` method and an optional `args` method to declare schemas:')
  lines.push('')
  lines.push('```javascript')
  lines.push('// Example Rune: git.js')
  lines.push('export function args(builder) {')
  lines.push('  return builder')
  lines.push('    .option(\'--verbose\', \'Verbose output\', false)')
  lines.push('    .command(\'remote\', \'Manage git remotes\', remote => {')
  lines.push('      remote.command(\'add\', \'Add remote\', add => {')
  lines.push('        add.positional(\'<name>\', \'Remote name\')')
  lines.push('           .positional(\'<url>\', \'Remote URL\')')
  lines.push('      })')
  lines.push('    })')
  lines.push('}')
  lines.push('')
  lines.push('export async function use(args) {')
  lines.push('  if (args.$command === \'remote add\') {')
  lines.push('    return `Adding remote ${args.name} at ${args.url}`;')
  lines.push('  }')
  lines.push('}')
  lines.push('```')
  lines.push('')
  lines.push('### Import System')
  lines.push('')
  lines.push('Rune files are ESM modules executed inside an isolated sandbox. The following import specifiers are supported:')
  lines.push('')
  lines.push('- **`from \'@utils\'`** \u2014 The standard utility namespace. Always available. Use this for all built-in capabilities (fs, shell, crypto, archive, etc.).')
  lines.push('- **`from \'./relative\'`** \u2014 Relative imports. Always available. Resolves relative to the current rune file. Ideal for shared helper modules within the same directory tree.')
  lines.push('- **`from \'@project/path\'`** \u2014 Import from the project root. Requires `fs.read:<path>` in the rune\'s allow list.')
  lines.push('- **`from \'@plugin/path\'`** \u2014 Plugin runes only. Resolves from the plugin\'s own root directory. Not available in project runes.')
  lines.push('- **`from \'node:fs\'` / `node:path` / etc.** \u2014 Always blocked. Node.js built-in modules are denied in the sandbox. Use the `@utils` equivalents: `utils.fs` for file I/O, `utils.shell` for process execution, `utils.crypto` for hashing/encryption.')
  lines.push('')

  // Section 2: Rune Exports API Reference
  lines.push('## 2. Rune Exports API Reference')
  lines.push('')
  lines.push('The sandboxed execution environment parses entrypoint exports to build schemas and run modules safely. Their dynamic type specification is detailed below:')
  lines.push('')
  lines.push(formatLifecycleDocs(lifecycleApiData))
  lines.push('')

  // Section 3: Global Sandbox APIs
  lines.push('## 3. Global Sandbox APIs')
  lines.push('')
  lines.push(formatGlobalsDocs(globalsApiData))
  lines.push('')

  // Section 4: CLI Calling & Argument Conventions
  lines.push('## 4. CLI Calling & Argument Conventions')
  lines.push('')
  lines.push('Crunes enforces a strict 3-tier boundary when executing runes via the CLI. Misplacing flags will cause the parser to fail or misinterpret the arguments.')
  lines.push('')
  lines.push('### The Strict 3-Tier Parsing Boundary')
  lines.push('All command invocations must follow this structural order exactly:')
  lines.push('1. **Global Flags**: Options parsed by the core process (e.g. `--cwd <path>`, `-p` for plain output, `--verbose`).')
  lines.push('2. **Command Flags**: Options parsed by the `use` command (e.g. `-b` / `--batch`, `--fail-fast`, `--format json`).')
  lines.push('3. **Rune Arguments**: Config and positional values passed directly to the execution sandbox.')
  lines.push('')
  lines.push('```bash')
  lines.push('# Correct Flag Placement')
  lines.push('crunes --cwd ./project -p use --format json greeting "Alice"')
  lines.push('```')
  lines.push('')
  lines.push('> [!WARNING]')
  lines.push('> Placing a global flag after `use` (e.g. `crunes use --cwd ./project`) causes an instant error.')
  lines.push('')
  lines.push('### The Misplaced Flag Pitfall (Section Filters)')
  lines.push('Section filtering flags (`-s` or `--section`) belong to the segment prefix *before* the rune key. If placed *after* the key, they are intercepted and treated as raw positional arguments inside the rune!')
  lines.push('')
  lines.push('```bash')
  lines.push('# CORRECT: The filter is parsed successfully, outputting only the "endpoints" section')
  lines.push('crunes use -s endpoints api v2')
  lines.push('')
  lines.push('# INCORRECT: Treated as positional args: args._ = ["--section", "endpoints"]')
  lines.push('crunes use api v2 --section endpoints')
  lines.push('```')
  lines.push('')
  lines.push('### Custom Commands & Nested Parameters Mapping')
  lines.push('Runes can recursively nest commands using \`.command()\` on the builder. Inside \`use(args)\`, Crunes automatically exposes:')
  lines.push('- **\`args.$command\`**: The space-separated matched command path string (e.g. \`"remote add"\`).')
  lines.push('- **\`args.$commands\`**: The matched command path levels array (e.g. \`["remote", "add"]\`).')
  lines.push('- **\`args._\`**: Data positionals only — command tokens are stripped, so \`args._[0]\` is always the first user-supplied value after the matched command.')
  lines.push('- **Named Positionals**: Parameters like \`<name>\` or \`[scope]\` are automatically mapped to \`args.name\` or \`args.scope\`.')
  lines.push('')
  lines.push('### Batched Executions')
  lines.push('Multiple runes can be run sequentially in one invocation using the `+` operator (requires the `-b` / `--batch` command flag):')
  lines.push('```bash')
  lines.push('crunes use -b -s endpoints api + greeting "World"')
  lines.push('```')
  lines.push('')
  lines.push('### Hook Token Prompt Syntax')
  lines.push('When using the Claude Code plugin (`crunes-aci`), prompt tokens are parsed automatically before submission:')
  lines.push('- **`$key`**: Runs `key` with all sections.')
  lines.push('- **`$key(arg1,arg2)`**: Passes positional arguments to `key`.')
  lines.push('- **`$key::sec1,sec2`**: Section filters applied to `key`.')
  lines.push('- **`$key(arg1)::sec1`**: Combination of positional argument and section filter.')
  lines.push('')

  // Section 5: Configuration Reference
  lines.push('## 5. Configuration Reference')
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
  lines.push('      "use": { "allow": ["fs.read:src/**", "fs.write:dist/**", "shell.exec:git *"] }')
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

  // Section 6: Dynamic @utils Reference
  lines.push('## 6. Dynamic `@utils` Reference')
  lines.push('')
  lines.push('The following utility namespaces are available to runes in the execution isolate:')
  lines.push('')

  for (const ns of namespaces) {
    lines.push(`### \`${ns.namespace}\``)
    lines.push('')
    if (ns.description) {
      lines.push(ns.description)
      lines.push('')
    }

    if (NAMESPACE_RECIPES[ns.namespace]) {
      lines.push('**Usage Example:**')
      lines.push(NAMESPACE_RECIPES[ns.namespace])
      lines.push('')
    }

    lines.push(formatUtilsNamespace(ns, globalsTypes))
    lines.push('')
    lines.push('---')
    lines.push('')
  }

  // Section 7: Workspace Context
  if (config) {
    lines.push('## 7. Workspace Context')
    lines.push('')
    lines.push(`- **Project Root**: \`${projectRoot}\``)
    lines.push(`- **Config Path**: \`${configRoot}\``)
    lines.push('')

    if (activeRunes.length > 0) {
      lines.push('### Registered Project Runes')
      lines.push('')
      lines.push('| Key | Name | Path | Permissions (Allow) |')
      lines.push('| --- | --- | --- | --- |')
      for (const r of activeRunes) {
        const allow = (r.permissions?.use?.allow ?? r.permissions?.allow ?? []).join(', ') || '*none*'
        lines.push(`| \`${r.key}\` | ${r.name} | \`${r.path}\` | \`${allow}\` |`)
      }
      lines.push('')

      lines.push('### Project Runes API & Usage')
      lines.push('')
      for (const r of activeRunes) {
        lines.push(`#### Rune: \`${r.key}\``)
        lines.push('')
        if (r.schemaError) {
          lines.push(`> [!WARNING]`)
          lines.push(`> Could not load argument schema: ${r.schemaError}`)
        } else if (r.schema) {
          lines.push(formatHelp(r.schema, { key: r.key, name: r.name, description: r.description }))
        } else {
          lines.push('*No custom arguments registered.*')
        }
        lines.push('')
        lines.push('---')
        lines.push('')
      }
    }

    const plugins = config.plugins ?? []
    if (plugins.length > 0) {
      lines.push('### Enabled Plugins')
      lines.push('')
      for (const pluginName of plugins) {
        lines.push(`- **${pluginName}**`)
      }
      lines.push('')
    }
  } else if (hasProjectError) {
    lines.push('## 7. Workspace Context')
    lines.push('')
    lines.push(`> [!WARNING]`)
    lines.push(`> Failed to resolve local project context: ${hasProjectError}`)
    lines.push('')
  } else {
    lines.push('## 7. Workspace Context')
    lines.push('')
    lines.push('_No local project context loaded (global mode enabled)._')
    lines.push('')
  }

  return lines.join('\n')
}
