import { loadConfig } from '../../core/config.js'
import { runRune } from '../resolver.js'
import { renderSection } from '../../shared/render.js'
import { output, isVerbose } from '../../shared/output.js'

import micromatch from 'micromatch'

export function parseSegment(argv) {
  let sections = null
  let i = 0

  while (i < argv.length) {
    const tok = argv[i]
    if ((tok === '--section' || tok === '-s') && i + 1 < argv.length) {
      sections = argv[i + 1].split(',').map(s => s.trim()).filter(Boolean)
      i += 2
    } else if (tok.startsWith('--section=')) {
      sections = tok.slice(10).split(',').map(s => s.trim()).filter(Boolean)
      i++
    } else if (tok.startsWith('-s=')) {
      sections = tok.slice(3).split(',').map(s => s.trim()).filter(Boolean)
      i++
    } else {
      break
    }
  }

  const key = argv[i] ?? null

  if (key && key.startsWith('-')) {
    output.error(`Unknown option or misplaced flag: "${key}"`)
    output.info(`
Arguments must follow this strict structure:
  1. Global Flags    (e.g., --cwd, --verbose)
  2. Command         (e.g., use, check, bench)
  3. Command Flags   (e.g., --format, -b)
  4. Rune Key        (e.g., myrune)
  5. Rune Arguments  (e.g., --strict, pos-arg)

Example: crunes --cwd ./dir use --format json myrune --strict
`.trimEnd())
    process.exit(1)
  }

  const runeArgs = key !== null ? argv.slice(i + 1) : []
  return { key, sections, runeArgs }
}

export function parseUseArgs(argv) {
  let format = 'md'
  let failFast = false
  let allowBatch = false
  let i = 0

  // Consume command-level flags from the prefix only — stops at the first non-flag token.
  // This ensures rune flags with the same name (e.g. --format) are never intercepted.
  while (i < argv.length) {
    const tok = argv[i]
    if (tok === '--format' && i + 1 < argv.length) {
      format = argv[i + 1]
      i += 2
    } else if (tok.startsWith('--format=')) {
      format = tok.slice(9)
      i++
    } else if (tok === '--fail-fast') {
      failFast = true
      i++
    } else if (tok === '-b' || tok === '--batch') {
      allowBatch = true
      i++
    } else {
      break
    }
  }

  const rawSegments = []
  let current = []
  for (const tok of argv.slice(i)) {
    if (allowBatch && tok === '+') {
      rawSegments.push(current)
      current = []
    } else {
      current.push(tok)
    }
  }
  rawSegments.push(current)

  const segments = rawSegments.map(parseSegment)
  return { segments, format, failFast }
}


export async function handler({
  segments,
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

  for (const { key, sections: sectionFilter, runeArgs } of segments) {
    let sections
    try {
      if (isVerbose) console.error(`[crunes:debug] Loading rune "${key}"`)
      sections = await runRune(projectRoot, config, key, runeArgs, { sections: sectionFilter, configDir: configRoot })
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
