import utilsApiData from './utils-api.json' assert { type: 'json' }
import { walkUtilsDocs } from './utils-walker.js'
import { formatUtilsNamespace } from './utils-formatter.js'
import { getRune } from '../rune/resolver.js'
import { getArgsSchema } from '../rune/isolation/runner.js'
import { formatHelp } from './formatter.js'
import { computeEffectivePermissions } from '../rune/permissions/permissions.js'
import { resolve } from 'node:path'

const NAMESPACE_RECIPES = {
  fs: `\`\`\`javascript
import { fs } from '@utils'

export async function use() {
  // Read and write files relative to the project root
  const content = await fs.read('src/components/Button.jsx');
  await fs.write('dist/output.txt', 'Hello Sandbox!');
  return 'File written successfully!';
}
\`\`\``,
  ws: `\`\`\`javascript
import { ws, section } from '@utils'

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
  const db = await sqlite.open('@project-sqlite', 'my-database');
  await db.exec('CREATE TABLE IF NOT EXISTS logs (id TEXT PRIMARY KEY, msg TEXT)');
  await db.exec('INSERT INTO logs VALUES (?, ?)', [crypto.uuid(), 'Rune executed!']);
  const rows = await db.query('SELECT * FROM logs');

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
  // Fetch from permitted hosts
  const response = await http.fetch('https://api.github.com/repos/darkrymit/crunes');
  const repo = await response.json();

  return [
    section.create('github-repo', {
      type: 'markdown',
      content: \`**Repo Description**: \${repo.description}\`
    })
  ];
}
\`\`\``,
  cache: `\`\`\`javascript
import { cache } from '@utils'

export async function use() {
  const projectCache = await cache.open('@project-cache');
  await projectCache.set('last-run', Date.now(), 60); // 60s TTL
  const lastRun = await projectCache.get('last-run');
  return \`Last run timestamp: \${lastRun}\`;
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

export async function compileIntro({ config, format, projectRoot, configRoot, hasProjectError }) {
  const namespaces = walkUtilsDocs(utilsApiData)

  const activeRunes = []
  if (config && !hasProjectError) {
    const runesList = Object.entries(config.runes ?? {})
    for (const [key, entry] of runesList) {
      const runeFile = resolve(configRoot, entry.path ?? `.crunes/runes/${key}.js`)
      const basePerms = entry.permissions ?? { allow: [], deny: [] }
      const effective = computeEffectivePermissions(basePerms, config.permissions?.[key], 'use')

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

  // Anatomy of a Rune
  lines.push('## 1. Anatomy of a Rune')
  lines.push('')
  lines.push('Crunes execute inside an isolated sandbox (`isolated-vm`). Runes are ESM modules exporting a `use` method:')
  lines.push('')
  lines.push('```javascript')
  lines.push('// Example Rune: hello.js')
  lines.push('export function args(builder) {')
  lines.push('  return builder')
  lines.push('    .positional(\'name\', { description: \'Target name\', default: \'World\' })')
  lines.push('}')
  lines.push('')
  lines.push('export async function use(args) {')
  lines.push('  const target = args.name;')
  lines.push('  return `Hello, ${target}!`;')
  lines.push('}')
  lines.push('```')
  lines.push('')

  // Permissions
  lines.push('## 2. Sandbox Security & Permissions')
  lines.push('')
  lines.push('Runes do not have direct access to Node.js APIs. They declare specific permission scopes in `.crunes/config.json`: ')
  lines.push('')
  lines.push('- **`allow`**: Whitelist of capabilities (e.g. `["fs:read:src/**", "http:fetch:api.github.com"]`).')
  lines.push('- **`deny`**: Blacklist of capabilities (processed first).')
  lines.push('')

  // Dynamic API Reference
  lines.push('## 3. Dynamic `@utils` Reference')
  lines.push('')
  lines.push('The following utility namespaces are available to runes in the execution isolate:')
  lines.push('')

  for (const ns of namespaces) {
    lines.push(`### \`utils.${ns.namespace}\``)
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

    lines.push(formatUtilsNamespace(ns))
    lines.push('')
    lines.push('---')
    lines.push('')
  }

  // Workspace Context
  if (config) {
    lines.push('## 4. Workspace Context')
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
        const allow = (r.permissions?.allow ?? []).join(', ') || '*none*'
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
    lines.push('## 4. Workspace Context')
    lines.push('')
    lines.push(`> [!WARNING]`)
    lines.push(`> Failed to resolve local project context: ${hasProjectError}`)
    lines.push('')
  } else {
    lines.push('## 4. Workspace Context')
    lines.push('')
    lines.push('_No local project context loaded (global mode enabled)._')
    lines.push('')
  }

  return lines.join('\n')
}
