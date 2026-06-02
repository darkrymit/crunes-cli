import { join } from 'node:path'
import { loadConfig } from '../../core/config.js'
import { getRune } from '../../rune/resolver.js'
import { getArgsSchema } from '../../rune/isolation/runner.js'
import { formatHelp } from '../formatter.js'
import { computeEffectivePermissions } from '../../rune/permissions/permissions.js'
import { output } from '../../shared/output.js'

export async function handler({ keys, format = 'text', projectRoot = process.cwd(), configRoot = projectRoot }) {
  let config
  try {
    config = loadConfig(configRoot)
  } catch (err) {
    output.error(`Config unreadable: ${err.message}`)
    process.exit(1)
  }

  const results = []
  let anyFailed = false

  for (const key of keys) {
    const entry = getRune(config, key)
    if (!entry) {
      output.warn(`Unknown rune: "${key}"`)
      anyFailed = true
      continue
    }

    const runeFile = join(configRoot, entry.path ?? `.crunes/runes/${key}.js`)
    const basePerms = entry.permissions ?? { allow: [], deny: [] }
    const effective = computeEffectivePermissions(basePerms, config.permissions?.[key], 'args', projectRoot)

    let schema = null
    try {
      schema = await getArgsSchema(runeFile, effective, projectRoot, { vars: entry.vars ?? {} })
    } catch (err) {
      output.warn(`Could not load args schema for "${key}": ${err.message}`)
    }

    results.push({
      key,
      name: entry.name ?? key,
      description: entry.description ?? null,
      schema,
    })
  }

  if (format === 'json') {
    process.stdout.write(JSON.stringify(results, null, 2) + '\n')
  } else {
    const blocks = results.map(r => formatHelp(r.schema, { key: r.key, name: r.name, description: r.description }))
    if (blocks.length > 0) process.stdout.write(blocks.join('\n\n') + '\n')
  }

  if (anyFailed) process.exit(1)
}
