import readline from 'node:readline'
import { isMatch } from '../../shared/match.js'
import { loadConfig } from '../../core/config.js'
import { formatSection } from '../../shared/render.js'
import { output, isVerbose } from '../../shared/output.js'
import { parseArgs } from '../api/args-parser.js'

export function parseReplReturn(value) {
  if (value === undefined || value === null) return { type: 'continue', prompt: null }
  if (typeof value === 'string') return { type: 'continue', prompt: value }
  if (value && typeof value === 'object') {
    if (value.type === 'done') return { type: 'done', message: value.message ?? null }
    if (value.type === 'prompt') return { type: 'continue', prompt: value.value ?? null }
  }
  return { type: 'continue', prompt: null }
}

export const BUILTIN_SLASH_COMMANDS = [
  { name: 'help',  description: 'Show available commands' },
  { name: 'clear', description: 'Clear the screen' },
  { name: 'exit',  description: 'End the session' },
]

const VALID_INPUT_TYPES = new Set(['line', 'interrupt', 'eof', 'command'])

export function parseJsonlInputLine(text) {
  if (!text) return null
  let parsed
  try { parsed = JSON.parse(text) } catch { return null }
  if (!parsed || !VALID_INPUT_TYPES.has(parsed.type)) return null
  return parsed
}

export function parseSlashCommand(line) {
  const trimmed = line.trim()
  if (!trimmed.startsWith('/')) return null
  const spaceIdx = trimmed.indexOf(' ')
  const name = spaceIdx === -1 ? trimmed.slice(1) : trimmed.slice(1, spaceIdx)
  const rest  = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1).trim()
  if (!name) return null
  return { name, rest }
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
  const jsonlInput = format === 'jsonl' && !process.stdin.isTTY

  function onEvent(event) {
    const { type, message, section, rune, instanceId: iid } = event
    if (format === 'jsonl') {
      process.stdout.write(JSON.stringify({ type, rune, instance: iid, ...(message != null ? { message } : {}), ...(section != null ? { section } : {}) }) + '\n')
    } else {
      if (type === 'section') {
        if (!sectionFilter || isMatch(section.name, sectionFilter)) {
          process.stdout.write(formatSection(section, rune) + '\n')
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

  // Print banner before first prompt
  if (session.banner) {
    if (format === 'jsonl') {
      process.stdout.write(JSON.stringify({ type: 'banner', rune: key, instance: instanceId, message: session.banner }) + '\n')
    } else {
      process.stderr.write(session.banner + '\n')
    }
  }

  let currentPrompt = session.initialPrompt ?? '> '
  let lineBuffer = []
  let sessionEnded = false
  let eofResolve = null
  const eofPromise = new Promise(resolve => { eofResolve = resolve })

  // Wire tab completer if rune exports completeInputRepl
  const completerFn = session.complete
    ? (line, cb) => {
        const tokens = line.length === 0 ? [''] : line.trimStart().split(/\s+/)
        // Ensure last token is the partial word (empty string if line ends with space)
        if (line.length > 0 && line[line.length - 1] === ' ') tokens.push('')
        Promise.resolve(session.complete(tokens))
          .then(candidates => {
            const partial = tokens[tokens.length - 1] ?? ''
            const matches = candidates.filter(c => c.startsWith(partial))
            cb(null, [matches, partial])
          })
          .catch(() => cb(null, [[], '']))
      }
    : undefined

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
    terminal: process.stdin.isTTY,
    historySize: process.stdin.isTTY ? 100 : 0,
    ...(completerFn ? { completer: completerFn } : {}),
  })

  function prompt() {
    if (process.stdin.isTTY) rl.setPrompt(currentPrompt)
    rl.prompt()
  }

  if (process.stdin.isTTY && !jsonlInput) {
    readline.emitKeypressEvents(process.stdin, rl)
    process.stdin.setRawMode(true)
    process.stdin.on('keypress', (ch, key) => {
      if (!key) return
      if (key.ctrl && key.name === 'return') {
        const currentLine = rl.line
        lineBuffer.push(currentLine)
        rl.write(null, { ctrl: true, name: 'u' })
        process.stderr.write('\n')
        rl.setPrompt(' '.repeat(currentPrompt.length))
        rl.prompt()
      }
    })
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

  function buildHelpText() {
    const lines = ['Built-in commands:']
    for (const cmd of BUILTIN_SLASH_COMMANDS) {
      lines.push(`  /${cmd.name.padEnd(8)} ${cmd.description}`)
    }
    if (session.commandsSchema?.commands?.length) {
      lines.push('Rune commands:')
      for (const cmd of session.commandsSchema.commands) {
        lines.push(`  /${cmd.name.padEnd(8)} ${cmd.description ?? ''}`)
      }
    }
    lines.push('Press Ctrl+D or return { type: "done" } from inputRepl() to exit.')
    return lines.join('\n')
  }

  // Process lines sequentially using an async queue to avoid race conditions
  // in piped (non-TTY) mode where readline fires all line events synchronously
  // before any async handler resolves.
  let queue = Promise.resolve()

  function enqueue(fn) {
    queue = queue.then(fn)
  }

  async function handleInputEvent(event) {
    if (sessionEnded) return
    let result
    try {
      result = await session.step(event)
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
  }

  rl.on('SIGINT', () => {
    // If we're mid-multiline: cancel the buffer and re-prompt
    if (lineBuffer.length > 0) {
      lineBuffer = []
      process.stderr.write('\n')
      rl.setPrompt(currentPrompt)
      prompt()
      return
    }
    // If line has content: clear it and re-prompt (standard terminal behaviour)
    if (rl.line && rl.line.length > 0) {
      process.stderr.write('\n')
      prompt()
      return
    }
    // Empty prompt: fire interrupt event into the queue
    enqueue(() => handleInputEvent({ type: 'interrupt', text: '' }))
  })

  rl.on('line', (text) => {
    enqueue(async () => {
      if (sessionEnded) return

      // Multiline flush: buffer has accumulated lines — append this one and dispatch the block
      if (lineBuffer.length > 0) {
        lineBuffer.push(text)
        const fullText = lineBuffer.join('\n')
        lineBuffer = []
        rl.setPrompt(currentPrompt)
        await handleInputEvent({ type: 'line', text: fullText })
        return
      }

      if (jsonlInput) {
        const event = parseJsonlInputLine(text)
        if (!event) {
          process.stdout.write(JSON.stringify({ type: 'error', rune: key, instance: instanceId, message: `Invalid JSONL input: ${text}` }) + '\n')
          return
        }
        await handleInputEvent(event)
        return
      }

      // Slash command interception
      const slash = parseSlashCommand(text)
      if (slash) {
        // Built-in commands
        if (slash.name === 'exit') {
          enqueue(() => handleInputEvent({ type: 'eof', text: '' }))
          return
        }
        if (slash.name === 'clear') {
          if (process.stdin.isTTY) process.stderr.write('\x1Bc')
          prompt()
          return
        }
        if (slash.name === 'help') {
          process.stderr.write(buildHelpText() + '\n')
          prompt()
          return
        }
        // Rune-declared command: parse args against commandsSchema and dispatch as 'command' event
        if (session.commandsSchema?.commands?.some(c => c.name === slash.name)) {
          const cmdSchema = {
            commands: session.commandsSchema.commands,
            options: [], positionals: [], examples: [],
          }
          const cmdTokens = slash.rest ? [slash.name, ...slash.rest.split(/\s+/)] : [slash.name]
          const parsedCmdArgs = parseArgs(cmdTokens, cmdSchema)
          await handleInputEvent({ type: 'command', args: parsedCmdArgs })
          return
        }
        // Unrecognised slash command: pass through as normal line
      }

      await handleInputEvent({ type: 'line', text })
    })
  })

  rl.on('close', () => {
    // Wait for the queue to drain, then send eof if session still running
    queue.then(async () => {
      if (!sessionEnded) {
        await handleInputEvent({ type: 'eof', text: '' })
      }
      eofResolve()
    })
  })

  prompt()
  await eofPromise
  await queue
}
