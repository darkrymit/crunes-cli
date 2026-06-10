import readline from 'node:readline'
import micromatch from 'micromatch'
import { loadConfig } from '../../core/config.js'
import { renderSection } from '../../shared/render.js'
import { output, isVerbose } from '../../shared/output.js'

export function parseReplReturn(value) {
  if (value === undefined || value === null) return { type: 'continue', prompt: null }
  if (typeof value === 'string') return { type: 'continue', prompt: value }
  if (value && typeof value === 'object') {
    if (value.type === 'done') return { type: 'done', message: value.message ?? null }
    if (value.type === 'prompt') return { type: 'continue', prompt: value.value ?? null }
  }
  return { type: 'continue', prompt: null }
}

export function parseReplArgs(argv) {
  let format = 'text'
  let i = 0

  while (i < argv.length) {
    const tok = argv[i]
    if (tok === '--format' && i + 1 < argv.length) {
      format = argv[i + 1]; i += 2
    } else if (tok.startsWith('--format=')) {
      format = tok.slice(9); i++
    } else {
      break
    }
  }

  let sections = null
  while (i < argv.length) {
    const tok = argv[i]
    if ((tok === '--section' || tok === '-s') && i + 1 < argv.length) {
      sections = argv[i + 1].split(',').map(s => s.trim()).filter(Boolean); i += 2
    } else if (tok.startsWith('--section=')) {
      sections = tok.slice(10).split(',').map(s => s.trim()).filter(Boolean); i++
    } else if (tok.startsWith('-s=')) {
      sections = tok.slice(3).split(',').map(s => s.trim()).filter(Boolean); i++
    } else {
      break
    }
  }

  const key = argv[i] ?? null
  const runeArgs = key !== null ? argv.slice(i + 1) : []
  return { key, sections, runeArgs, format }
}

export async function handler({
  key,
  runeArgs = [],
  sections: sectionFilter = null,
  format = 'text',
  projectRoot = process.cwd(),
  configRoot = projectRoot,
}) {
  if (!key) {
    output.error('Missing required argument: <rune>')
    process.exit(1)
  }

  let config
  try {
    config = loadConfig(configRoot)
  } catch (err) {
    output.error(`Config unreadable: ${err.message}`)
    output.info('Run `crunes init` to create a config file.')
    process.exit(1)
  }

  const { resolveRuneEntry } = await import('../resolver.js')
  let runeEntry
  try {
    runeEntry = await resolveRuneEntry(projectRoot, config, key, configRoot)
  } catch (err) {
    output.error(`Rune "${key}" not found: ${err.message}`)
    process.exit(1)
  }

  const instanceId = '1'

  function onEvent(event) {
    const { type, message, section, rune, instanceId: iid } = event
    if (format === 'jsonl') {
      process.stdout.write(JSON.stringify({ type, rune, instance: iid, ...(message != null ? { message } : {}), ...(section != null ? { section } : {}) }) + '\n')
    } else {
      if (type === 'section') {
        if (!sectionFilter || micromatch.isMatch(section.name, sectionFilter)) {
          const rendered = renderSection(section)
          if (rendered) process.stdout.write(rendered + '\n')
        }
      } else if (type === 'log' || type === 'error') {
        process.stderr.write(message + '\n')
      }
    }
  }

  let session
  try {
    session = await runeEntry.createReplSession(runeArgs, { onEvent, instanceId })
  } catch (err) {
    const msg = isVerbose ? (err.stack || err.message) : err.message
    output.error(`Failed to start REPL for "${key}": ${msg}`)
    process.exit(1)
  }

  if (format === 'jsonl') {
    process.stdout.write(JSON.stringify({ type: 'session-start', rune: key, instance: instanceId }) + '\n')
  }

  let currentPrompt = '> '
  let sessionEnded = false
  // Resolves when the session should end (set by close event)
  let eofResolve = null
  const eofPromise = new Promise(resolve => { eofResolve = resolve })

  const rl = readline.createInterface({ input: process.stdin, output: process.stderr, terminal: process.stdin.isTTY })

  function prompt() {
    if (process.stdin.isTTY) rl.setPrompt(currentPrompt)
    rl.prompt()
  }

  async function endSession(message) {
    if (sessionEnded) return
    sessionEnded = true
    if (message) {
      if (format === 'jsonl') {
        process.stdout.write(JSON.stringify({ type: 'session-end', rune: key, instance: instanceId, message }) + '\n')
      } else {
        process.stderr.write(message + '\n')
      }
    } else if (format === 'jsonl') {
      process.stdout.write(JSON.stringify({ type: 'session-end', rune: key, instance: instanceId }) + '\n')
    }
    rl.close()
    await session.dispose()
  }

  // Process lines sequentially using an async queue to avoid race conditions
  // in piped (non-TTY) mode where readline fires all line events synchronously
  // before any async handler resolves.
  let queue = Promise.resolve()

  rl.on('line', (input) => {
    queue = queue.then(async () => {
      if (sessionEnded) return
      let result
      try {
        result = await session.step(input)
      } catch (err) {
        if (sessionEnded) return
        const msg = isVerbose ? (err.stack || err.message) : err.message
        if (format === 'jsonl') {
          process.stdout.write(JSON.stringify({ type: 'error', rune: key, instance: instanceId, message: msg }) + '\n')
        } else {
          process.stderr.write(`Error: ${msg}\n`)
        }
        prompt()
        return
      }

      const signal = parseReplReturn(result)

      if (signal.type === 'done') {
        await endSession(signal.message)
        eofResolve()
        return
      }

      if (signal.prompt !== null) currentPrompt = signal.prompt
      prompt()
    })
  })

  rl.on('close', () => {
    // Wait for the queue to drain, then end session if not already done
    queue.then(async () => {
      eofResolve()
      await endSession(null)
    })
  })

  prompt()
  await eofPromise
  await queue
}
