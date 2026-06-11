import { loadConfig } from '../../core/config.js'
import { runRune } from '../resolver.js'
import { renderSection } from '../../shared/render.js'
import { output, isVerbose } from '../../shared/output.js'
import { checkBatchPermission, buildMatchString } from './batch-permission.js'

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

export function parseRunArgs(argv) {
  let format = 'text'
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
  return { segments, format, failFast, isBatch: allowBatch }
}


export async function handler({
  segments,
  format = 'text',
  failFast = false,
  isBatch = false,
  projectRoot = process.cwd(),
  configRoot = projectRoot,
}) {
  // Early gating for empty/missing keys
  for (const seg of segments) {
    if (!seg.key) {
      output.error('Missing required argument: <rune>')
      process.exit(1)
    }
  }

  let config
  try {
    config = loadConfig(configRoot)
  } catch (err) {
    output.error(`Config unreadable: ${err.message}`)
    output.info('Run `crunes init` to create a config file.')
    process.exit(1)
  }

  if (isBatch) {
    for (const seg of segments) {
      const entry = config.runes?.[seg.key] ?? {}
      const matchString = buildMatchString(seg.key, seg.runeArgs)
      const result = checkBatchPermission(entry, matchString)
      if (!result.allowed) {
        output.error(`Batch not permitted for "${matchString}". Add a batch.allow pattern in config.json or run it separately.`)
        process.exit(1)
      }
    }
  }

  let anyFailed = false

  for (let i = 0; i < segments.length; i++) {
    const printedSections = new Set()
    const { key, sections: sectionFilter, runeArgs } = segments[i]
    let sections
    try {
      if (isVerbose) console.error(`[crunes:debug] Loading rune "${key}"`)
      
      sections = await runRune(projectRoot, config, key, runeArgs, {
        sections: sectionFilter,
        configDir: configRoot,
        instanceId: String(i + 1),
        onEvent(event) {
          const { type, message, section, instanceId, rune } = event
          const prefix = `[${instanceId}:${rune}:${type}]`
          if (format === 'jsonl') {
            if (type === 'section') {
              if (sectionFilter && !micromatch.isMatch(section.name, sectionFilter)) {
                return
              }
              printedSections.add(section)
            }
            process.stdout.write(JSON.stringify({
              type,
              rune,
              instance: instanceId,
              ...(message != null ? { message } : {}),
              ...(section != null ? { section } : {}),
            }) + '\n')
          } else {
            if (type === 'section') {
              if (!sectionFilter || micromatch.isMatch(section.name, sectionFilter)) {
                const rendered = renderSection(section)
                const lines = rendered ? rendered.split('\n') : []
                let contentStartIndex = 1
                let attrs = ''
                if (lines[1] && lines[1].startsWith('[')) {
                  attrs = ' ' + lines[1]
                  contentStartIndex = 2
                }
                const content = lines.slice(contentStartIndex).join('\n')
                process.stdout.write(`${prefix} ${section.name}${attrs}\n${content}\n\n`)
                printedSections.add(section)
              }
            } else {
              if (message && message.includes('\n')) {
                process.stdout.write(`${prefix}\n${message}\n\n`)
              } else {
                process.stdout.write(`${prefix} ${message ?? ''}\n`)
              }
            }
          }
        }
      })
      
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

    // Print any sections returned by the rune that were not progressively emitted
    const instanceId = String(i + 1)
    for (const sect of filtered) {
      const alreadyPrinted = Array.from(printedSections).some(p => p.name === sect.name)
      if (!alreadyPrinted) {
        if (format === 'jsonl') {
          process.stdout.write(JSON.stringify({
            type: 'section',
            rune: key,
            instance: instanceId,
            section: sect
          }) + '\n')
        } else {
          const rendered = renderSection(sect)
          if (rendered) {
            const prefix = `[${instanceId}:${key}:section]`
            const lines = rendered.split('\n')
            let contentStartIndex = 1
            let attrs = ''
            if (lines[1] && lines[1].startsWith('[')) {
              attrs = ' ' + lines[1]
              contentStartIndex = 2
            }
            const content = lines.slice(contentStartIndex).join('\n')
            process.stdout.write(`${prefix} ${sect.name}${attrs}\n${content}\n\n`)
          }
        }
        printedSections.add(sect)
      }
    }
  }

  if (anyFailed) process.exit(1)
}
