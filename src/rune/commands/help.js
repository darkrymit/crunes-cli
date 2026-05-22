import { join } from 'node:path'
import { loadConfig } from '../../core/config.js'
import { getRune } from '../resolver.js'
import { getArgsSchema } from '../isolation/runner.js'
import { formatHelp } from '../api/args-parser.js'
import { computeEffectivePermissions } from '../permissions/permissions.js'
import { output } from '../../shared/output.js'

export async function handler({ key, projectRoot = process.cwd(), configRoot = projectRoot }) {
  let config
  try {
    config = loadConfig(configRoot)
  } catch (err) {
    output.error(`Config unreadable: ${err.message}`)
    process.exit(1)
  }

  const entry = getRune(config, key)
  if (!entry) {
    output.error(`Unknown rune: "${key}"`)
    process.exit(1)
  }

  const runeFile = join(configRoot, entry.path ?? `.crunes/runes/${key}.js`)
  const basePerms = entry.permissions ?? { allow: [], deny: [] }
  const effective = computeEffectivePermissions(basePerms, config.permissions?.[key], 'use')

  let schema = null
  try {
    schema = await getArgsSchema(runeFile, effective, projectRoot, { vars: entry.vars ?? {} })
  } catch (err) {
    output.warn(`Could not load args schema: ${err.message}`)
  }

  const runeMeta = { key, name: entry.name ?? key, description: entry.description }
  process.stdout.write(formatHelp(schema, runeMeta) + '\n')
}
