import { loadConfig } from '../../core/config.js'
import { runRune } from '../resolver.js'
import { renderSection } from '../../shared/render.js'
import { output, isVerbose } from '../../shared/output.js'

import micromatch from 'micromatch'

export function parseKeyToken(token) {
  let rest = token
  let sections = null

  const dblColonIdx = rest.indexOf('::')
  if (dblColonIdx !== -1) {
    const sectionStr = rest.slice(dblColonIdx + 2)
    const parsed = sectionStr.split(',').map(s => s.trim()).filter(Boolean)
    sections = parsed.length > 0 ? parsed : null
    rest = rest.slice(0, dblColonIdx)
  }

  let key
  let args = []
  const eqIdx = rest.indexOf('=')
  if (eqIdx !== -1) {
    key = rest.slice(0, eqIdx)
    const argStr = rest.slice(eqIdx + 1)
    args = argStr.split(',').map(a => a.trim()).filter(Boolean)
  } else {
    key = rest
  }

  return { key, args, sections }
}

export async function handler({
  keys,
  format = 'md',
  failFast = false,
  projectRoot = process.cwd(),
  configRoot = projectRoot,
}) {
  let config
  try {
    config = loadConfig(configRoot)
  } catch (err) {
    output.error(`Config unreadable: ${err.message}`)
    output.info('Run `crunes init` to create a config file.')
    process.exit(1)
  }

  const allSections = []
  let anyFailed = false

  for (const token of keys) {
    const { key, args, sections: sectionFilter } = parseKeyToken(token)

    let sections
    try {
      if (isVerbose) console.error(`[crunes:debug] Loading rune "${key}"`)
      sections = await runRune(projectRoot, config, key, args, { sections: sectionFilter, configDir: configRoot })
      if (isVerbose) console.error(`[crunes:debug] Rune "${key}" completed with ${sections?.length ?? 0} sections`)
    } catch (err) {
      const msg = isVerbose ? (err.stack || err.message) : err.message
      output.error(`Rune "${key}" failed: \n${msg}`)
      anyFailed = true
      if (failFast) process.exit(1)
      continue
    }

    if (!sections) {
      const available = Object.keys(config.runes ?? {}).join(', ') || '(none)'
      output.error(`Unknown key: "${key}". Available: ${available}`)
      anyFailed = true
      if (failFast) process.exit(1)
      continue
    }

    const filtered = sectionFilter
      ? sections.filter(s => micromatch.isMatch(s.name, sectionFilter))
      : sections

    allSections.push(...filtered)
  }

  if (format === 'json') {
    process.stdout.write(JSON.stringify(allSections, null, 2) + '\n')
  } else {
    const rendered = allSections
      .map(s => renderSection(s))
      .filter(Boolean)
      .join('\n\n')
    if (rendered) process.stdout.write(rendered + '\n')
  }

  if (anyFailed) process.exit(1)
}
