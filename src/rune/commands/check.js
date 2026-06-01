import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadConfig } from '../../core/config.js'
import { runRune } from '../resolver.js'
import { output } from '../../shared/output.js'

export function scanPermissionWarnings(runeSource) {
  const warnings = []
  
  // Legacy global utils checking
  const GATED_UTILS = ['utils.fs', 'utils.shell', 'utils.fetch', 'utils.env', 'utils.archive', 'utils.cache']
  for (const u of GATED_UTILS) {
    if (runeSource.includes(u)) {
      warnings.push(u)
    }
  }

  // Modern destructured named imports from '@utils'
  const importRegex = /import\s*\{\s*([^}]+)\s*\}\s*from\s*['"]@utils['"]/g
  let match
  const importedNames = new Set()
  
  while ((match = importRegex.exec(runeSource)) !== null) {
    const names = match[1].split(',').map(n => n.trim().split(/\s+as\s+/)[0])
    for (const name of names) {
      if (name) importedNames.add(name)
    }
  }

  const namespaces = ['fs', 'shell', 'fetch', 'env', 'archive', 'cache']
  for (const ns of namespaces) {
    if (importedNames.has(ns)) {
      const warningKey = `utils.${ns}`
      if (!warnings.includes(warningKey)) {
        warnings.push(warningKey)
      }
    }
  }

  return warnings
}

const KEBAB_RE = /^[a-z0-9-]+$/

function checkSections(sections) {
  const errors = []

  if (!Array.isArray(sections)) {
    errors.push({ section: null, message: 'use() must return an array' })
    return errors
  }

  const seen = new Set()
  for (const sec of sections) {
    const name = sec?.name

    if (typeof name !== 'string' || name.length === 0) {
      errors.push({ section: null, message: 'section is missing a non-empty name' })
      continue
    }

    if (!KEBAB_RE.test(name)) {
      errors.push({ section: name, message: `section "${name}" must be kebab-case (a-z, 0-9, -)` })
    }

    if (seen.has(name)) {
      errors.push({ section: name, message: `duplicate section name "${name}"` })
    }
    seen.add(name)

    if (sec.data == null) {
      errors.push({ section: name, message: `section "${name}" is missing data` })
      continue
    }

    const { type } = sec.data
    if (type !== 'markdown' && type !== 'tree') {
      errors.push({ section: name, message: `section "${name}" has unknown type "${type ?? 'undefined'}"` })
      continue
    }

    if (type === 'markdown') {
      if (typeof sec.data.content !== 'string' || sec.data.content.length === 0) {
        errors.push({ section: name, message: `section "${name}" markdown content must be a non-empty string` })
      }
    }

    if (type === 'tree') {
      const root = sec.data.root
      if (!root || typeof root.name === 'undefined' || !Array.isArray(root.children)) {
        errors.push({ section: name, message: `section "${name}" tree root must have name and children` })
      }
    }
  }

  return errors
}

export async function handler({ key, runeArgs = [], sections = null, projectRoot = process.cwd(), configRoot = projectRoot } = {}) {
  let config
  try {
    config = loadConfig(configRoot)
  } catch (err) {
    output.error(`Config unreadable: ${err.message}`)
    process.exit(1)
  }

  const entry = config.runes?.[key]
  if (entry?.path && !(entry.permissions?.allow?.length)) {
    let src = ''
    try { src = readFileSync(join(configRoot, entry.path), 'utf8') } catch { /* skip unreadable */ }
    for (const util of scanPermissionWarnings(src)) {
      output.warn(`${key} — permissions.allow is empty but rune uses ${util}`)
    }
  }

  let result
  try {
    result = await runRune(projectRoot, config, key, runeArgs, { configDir: configRoot })
  } catch (err) {
    output.error(`${key}: ${err.message}`)
    process.exit(1)
  }

  if (!result) {
    output.error(`${key}: rune not found`)
    process.exit(1)
  }

  const errors = checkSections(result)

  if (errors.length === 0) {
    output.success(`${key} — ${result.length} section${result.length === 1 ? '' : 's'}`)
  } else {
    for (const { message } of errors) {
      output.error(`${key} — ${message}`)
    }
    console.log(`\n${errors.length} problem${errors.length === 1 ? '' : 's'} found.`)
    process.exit(1)
  }
}
