import { performance } from 'node:perf_hooks'
import chalk from 'chalk'
import { loadConfig } from '../../core/config.js'
import { runRune, getRune } from '../resolver.js'
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

export async function handler({
  key,
  runs = 1,
  plain = false,
  projectRoot = process.cwd(),
  configRoot = projectRoot,
} = {}) {
  let config
  try {
    config = loadConfig(configRoot)
  } catch (err) {
    output.error(`Config unreadable: ${err.message}`)
    output.info('Run `crunes init` to create a config file.')
    process.exit(1)
  }

  // Build list of keys to benchmark
  let keys
  if (key) {
    keys = [key]
  } else {
    keys = Object.keys(config.runes ?? {})
    if (keys.length === 0) {
      output.info('No runes configured. Run `crunes create <key>` to add one.')
      return
    }
  }

  if (!plain) {
    console.log(chalk.dim('─'.repeat(40)))
    console.log(chalk.bold('crunes benchmark'))
    console.log()
  }

  const results = []

  for (const k of keys) {
    const times = []
    let err = null

    // Warmup run — discarded, avoids cold-start skewing first measurement
    try { await runRune(projectRoot, config, k, [], { configDir: configRoot }) } catch {}

    for (let i = 0; i < runs; i++) {
      const t0 = performance.now()
      try {
        await runRune(projectRoot, config, k, [], { configDir: configRoot })
      } catch (e) {
        err = e
        break
      }
      times.push(performance.now() - t0)
    }

    if (err) {
      results.push({ key: k, ms: null, err })
    } else {
      const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length)
      results.push({ key: k, ms: avg, err: null })
    }
  }

  // Determine column width for alignment
  const maxKeyLen = Math.max(...results.map(r => r.key.length))

  let total = 0
  let slowCount = 0

  for (const r of results) {
    const k = r.key.padEnd(maxKeyLen)

    if (r.err) {
      if (plain) {
        process.stdout.write(`${r.key}\terror\t${r.err.message}\n`)
      } else {
        console.log(`  ${chalk.dim(k)}  ${chalk.red('error')}  ${chalk.dim(r.err.message)}`)
      }
      continue
    }

    const l = label(r.ms)
    if (l === 'slow') slowCount++
    total += r.ms

    if (plain) {
      process.stdout.write(`${r.key}\t${r.ms}\t${l}\n`)
    } else {
      const warn = l === 'slow' ? `  ${chalk.yellow('⚠')}` : ''
      console.log(`  ${chalk.cyan(k)}  ${String(r.ms).padStart(6)}ms  ${bar(r.ms, plain)}  ${labelColour(l, plain)}${warn}`)
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
