#!/usr/bin/env node


if (process.env.CRUNES_NO_TIMEOUT === '1') {
  const runIdx = process.argv.indexOf('run')
  if (runIdx !== -1 && process.argv[runIdx + 1]) {
    process.title = `crunes: ${process.argv[runIdx + 1]}`
  }
}
import { buildProgram } from './program.js'

const program = buildProgram()

process.on('uncaughtException', (err) => {
  console.error('[crunes] FATAL UNCAUGHT EXCEPTION:', err)
  process.exit(1)
})

process.on('unhandledRejection', (reason) => {
  console.error('[crunes] FATAL UNHANDLED REJECTION:', reason)
  process.exit(1)
})

// -v is contextual: acts as --verbose when a command is present, --version when used alone
const hasCommand = process.argv.length > 2 && !process.argv[2].startsWith('-')
if (hasCommand) {
  const vIndex = process.argv.indexOf('-v')
  if (vIndex !== -1) process.argv[vIndex] = '--verbose'
}

program.parseAsync(process.argv).catch(err => {
  console.error('[crunes] FATAL CLI ERROR:', err)
  process.exit(1)
})
