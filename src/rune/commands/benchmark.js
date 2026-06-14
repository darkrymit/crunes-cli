import { performance } from 'node:perf_hooks'
import chalk from 'chalk'
import { loadConfig } from '../../core/config.js'
import { runRune } from '../resolver.js'
import { parseBracketKey } from './run.js'
import { output } from '../../shared/output.js'

const FAST_MS  = 200
const SLOW_MS  = 1000
const BAR_WIDTH = 10

function label(ms) {
  if (ms >= SLOW_MS) return 'slow'
  if (ms >= FAST_MS) return 'ok'
  return 'fast'
}

function bar(ms, plain) {
  const ratio = Math.min(ms / SLOW_MS, 1)
  const filled = Math.round(ratio * BAR_WIDTH)
  const empty  = BAR_WIDTH - filled
  const fill = '█'.repeat(filled) + '░'.repeat(empty)
  if (plain) return fill
  if (ms >= SLOW_MS) return chalk.red(fill)
  if (ms >= FAST_MS) return chalk.yellow(fill)
  return chalk.green(fill)
}

function labelColour(l, plain) {
  if (plain) return l
  if (l === 'slow') return chalk.red(l)
  if (l === 'ok')   return chalk.yellow(l)
  return chalk.green(l)
}

export function parseBenchArgs(argv) {
  let globalRuns = 1
  let globalWarmup = false
  let allowBatch = false
  let failFast = false
  let format = 'text'
  let i = 0

  while (i < argv.length) {
    const tok = argv[i]
    if (tok === '--runs' && i + 1 < argv.length) {
      globalRuns = parseInt(argv[i + 1], 10); i += 2
    } else if (tok.startsWith('--runs=')) {
      globalRuns = parseInt(tok.slice(7), 10); i++
    } else if (tok === '--warmup') {
      globalWarmup = true; i++
    } else if (tok === '-b' || tok === '--batch') {
      allowBatch = true; i++
    } else if (tok === '--fail-fast') {
      failFast = true; i++
    } else if (tok === '--format' && i + 1 < argv.length) {
      format = argv[i + 1]; i += 2
    } else if (tok.startsWith('--format=')) {
      format = tok.slice(9); i++
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

  const segments = rawSegments.map(seg => {
    const { key, bracketArgs } = parseBracketKey(seg[0] ?? '')
    let runs = globalRuns
    let warmup = globalWarmup
    let sections = null
    let j = 0
    while (j < bracketArgs.length) {
      const tok = bracketArgs[j]
      if (tok === '--runs' && j + 1 < bracketArgs.length) {
        runs = parseInt(bracketArgs[j + 1], 10); j += 2
      } else if (tok.startsWith('--runs=')) {
        runs = parseInt(tok.slice(7), 10); j++
      } else if (tok === '--warmup') {
        warmup = true; j++
      } else if ((tok === '--section' || tok === '-s') && j + 1 < bracketArgs.length) {
        sections = bracketArgs[j + 1].split(',').map(s => s.trim()).filter(Boolean); j += 2
      } else if (tok.startsWith('--section=')) {
        sections = tok.slice(10).split(',').map(s => s.trim()).filter(Boolean); j++
      } else if (tok.startsWith('-s=')) {
        sections = tok.slice(3).split(',').map(s => s.trim()).filter(Boolean); j++
      } else {
        j++
      }
    }
    return { key: key || null, runs, warmup, sections, runeArgs: seg.slice(1) }
  })

  return { segments, format, failFast, isBatch: allowBatch, globalRuns, globalWarmup }
}

export async function handler({
  segments,
  key,
  runeArgs = [],
  runs: legacyRuns,
  warmup: legacyWarmup,
  format: _format = 'text',
  failFast = false,
  isBatch: _isBatch = false,
  plain = false,
  projectRoot = process.cwd(),
  configRoot = projectRoot,
} = {}) {
  // Support legacy single-rune call shape (handler({ key, runeArgs, runs, warmup }))
  const resolvedSegments = segments ?? [{ key, runeArgs, runs: legacyRuns ?? 1, warmup: legacyWarmup ?? false, sections: null }]

  const firstKey = resolvedSegments[0]?.key
  if (!firstKey) {
    output.error('Missing required argument: <rune>')
    process.exit(1)
  }

  for (const seg of resolvedSegments) {
    if (!Number.isInteger(seg.runs) || seg.runs < 1) {
      output.error('Invalid option: --runs must be a positive integer >= 1')
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

  if (!plain) {
    console.log(chalk.dim('─'.repeat(40)))
    console.log(chalk.bold('crunes benchmark'))
    console.log()
  }

  const maxKeyLen = Math.max(...resolvedSegments.map(s => (s.key ?? '').length))
  let total = 0
  let slowCount = 0

  for (const seg of resolvedSegments) {
    const { key: segKey, runeArgs: segArgs, runs, warmup } = seg
    const times = []
    let err = null

    if (warmup) {
      try { await runRune(projectRoot, config, segKey, segArgs, { configDir: configRoot }) } catch {}
    }

    for (let i = 0; i < runs; i++) {
      const t0 = performance.now()
      try {
        await runRune(projectRoot, config, segKey, segArgs, { configDir: configRoot })
      } catch (e) {
        err = e
        break
      }
      times.push(performance.now() - t0)
    }

    if (err) {
      if (plain) {
        process.stdout.write(`${segKey}\terror\t${err.message}\n`)
      } else {
        console.log(`  ${chalk.dim(segKey.padEnd(maxKeyLen))}  ${chalk.red('error')}  ${chalk.dim(err.message)}`)
      }
      if (failFast) process.exit(1)
    } else {
      const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length)
      const l = label(avg)
      if (l === 'slow') slowCount++
      total += avg

      if (plain) {
        process.stdout.write(`${segKey}\t${avg}\t${l}\n`)
      } else {
        const k = segKey.padEnd(maxKeyLen)
        const warn = l === 'slow' ? `  ${chalk.yellow('⚠')}` : ''
        console.log(`  ${chalk.cyan(k)}  ${String(avg).padStart(6)}ms  ${bar(avg, plain)}  ${labelColour(l, plain)}${warn}`)
      }
    }
  }

  if (plain) {
    process.stdout.write(`total\t${total}\nslow-count\t${slowCount}\n`)
  } else {
    console.log()
    const slowMsg = slowCount > 0
      ? `  ${chalk.yellow('⚠')} ${slowCount} slow rune${slowCount > 1 ? 's' : ''} (> ${SLOW_MS}ms)`
      : `  ${chalk.green('✓')} All runes within acceptable range`
    console.log(`  ${chalk.dim('Total:')} ${total}ms`)
    console.log(slowMsg)
    console.log()
  }
}
