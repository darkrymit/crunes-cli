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

// Commander resolves --help against the root program before it rejects an unknown
// command, so `crunes nosuch --help` printed the root help and exited 0 — which reads
// as "nosuch exists". Reject the unknown name first, whatever follows it.
// Global flags may precede the command, and two of them take a value.
const VALUED_GLOBALS = new Set(['--cwd', '--ccd'])
let cmdIdx = 2
while (cmdIdx < process.argv.length && process.argv[cmdIdx].startsWith('-')) {
  const tok = process.argv[cmdIdx]
  cmdIdx += VALUED_GLOBALS.has(tok) ? 2 : 1
}
if (cmdIdx < process.argv.length) {
  const name = process.argv[cmdIdx]
  const known = new Set(['help'])
  for (const c of program.commands) {
    known.add(c.name())
    for (const a of c.aliases()) known.add(a)
  }
  if (!known.has(name)) {
    console.error(`error: unknown command '${name}'`)
    console.error(`Run 'crunes --help' for a list of commands.`)
    process.exit(1)
  }
}

program.parseAsync(process.argv).catch(err => {
  console.error('[crunes] FATAL CLI ERROR:', err)
  process.exit(1)
})
