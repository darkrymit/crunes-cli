import { performance } from 'node:perf_hooks'
import chalk from 'chalk'
import { loadConfig } from '../../core/config.js'
import { runRune } from '../resolver.js'
import { parseSegment } from './use.js'
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
  let runs = 1
  let warmup = false
  let i = 0

  // Consume command-level flags from the prefix only — stops at the first non-flag token.
  // This ensures rune flags with the same name (e.g. --runs) are never intercepted.
  while (i < argv.length) {
    const tok = argv[i]
    if (tok === '--runs' && i + 1 < argv.length) {
      runs = parseInt(argv[i + 1], 10)
      i += 2
    } else if (tok.startsWith('--runs=')) {
      runs = parseInt(tok.slice(7), 10)
      i++
    } else if (tok === '--warmup') {
      warmup = true
      i++
    } else {
      break
    }
  }

  const { key, sections, runeArgs } = parseSegment(argv.slice(i))
  return { key, sections, runeArgs, runs, warmup }
}

export async function handler({
  key,
  runeArgs = [],
  runs = 1,
  warmup = false,
  plain = false,
  projectRoot = process.cwd(),
  configRoot = projectRoot,
} = {}) {
  if (!key) {
    output.error('Missing required argument: <rune>')
    process.exit(1)
  }

  if (!Number.isInteger(runs) || runs < 1) {
    output.error('Invalid option: --runs must be a positive integer >= 1')
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

  if (!plain) {
    console.log(chalk.dim('─'.repeat(40)))
    console.log(chalk.bold('crunes benchmark'))
    console.log()
  }

  const times = []
  let err = null

  if (warmup) {
    try { await runRune(projectRoot, config, key, runeArgs, { configDir: configRoot }) } catch {}
  }

  for (let i = 0; i < runs; i++) {
    const t0 = performance.now()
    try {
      await runRune(projectRoot, config, key, runeArgs, { configDir: configRoot })
    } catch (e) {
      err = e
      break
    }
    times.push(performance.now() - t0)
  }

  const maxKeyLen = key.length

  let total = 0
  let slowCount = 0

  if (err) {
    if (plain) {
      process.stdout.write(`${key}\terror\t${err.message}\n`)
    } else {
      console.log(`  ${chalk.dim(key.padEnd(maxKeyLen))}  ${chalk.red('error')}  ${chalk.dim(err.message)}`)
    }
  } else {
    const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length)
    const l = label(avg)
    if (l === 'slow') slowCount++
    total += avg

    if (plain) {
      process.stdout.write(`${key}\t${avg}\t${l}\n`)
    } else {
      const k = key.padEnd(maxKeyLen)
      const warn = l === 'slow' ? `  ${chalk.yellow('⚠')}` : ''
      console.log(`  ${chalk.cyan(k)}  ${String(avg).padStart(6)}ms  ${bar(avg, plain)}  ${labelColour(l, plain)}${warn}`)
    }
  }

  if (plain) {
    process.stdout.write(`total\t${total}\nslow-count\t${slowCount}\n`)
  } else {
    console.log()
    const slowMsg = slowCount > 0
      ? `  ${chalk.yellow('⚠')} ${slowCount} slow rune${slowCount > 1 ? 's' : ''} (> ${SLOW_MS}ms)`
      : `  ${chalk.green('✓')} All runes within acceptable range`
    console.log(`  ${chalk.dim('Total:')} ${total}ms${runs > 1 ? ` (avg of ${runs} runs)` : ''}`)
    console.log(slowMsg)
    console.log()
  }
}
