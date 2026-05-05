#!/usr/bin/env node
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const majorVersion = parseInt(process.versions.node.split('.')[0], 10)
if (majorVersion >= 20 && !process.execArgv.includes('--no-node-snapshot')) {
  const result = spawnSync(process.execPath, ['--no-node-snapshot', ...process.argv.slice(1)], { stdio: 'inherit' })
  process.exit(result.status ?? 1)
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
