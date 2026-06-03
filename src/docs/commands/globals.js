import globalsApiData from '../generated/globals-api.json' assert { type: 'json' }
import { walk } from '../ts-walker.js'
import { formatMembers } from '../ts-formatter.js'

const ES2020_BUILTINS = [
  'ArrayBuffer', 'Uint8Array', 'Int8Array', 'Uint16Array', 'Int16Array',
  'Uint32Array', 'Int32Array', 'Float32Array', 'Float64Array',
  'Promise', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Symbol', 'BigInt',
  'Date', 'RegExp', 'Error', 'JSON', 'Math',
]

const [GLOBALS_NS] = walk(globalsApiData)

export async function handler({ format = 'text' } = {}) {
  if (format === 'json') {
    const out = {
      members: GLOBALS_NS?.members ?? [],
      es2020Builtins: ES2020_BUILTINS,
    }
    process.stdout.write(JSON.stringify(out, null, 2) + '\n')
    return
  }

  const lines = []
  lines.push('Injected Sandbox Globals')
  lines.push('  Explicitly set on globalThis by the sandbox bootstrap.')
  lines.push('  ES2020 builtins (ArrayBuffer, Promise, Map, ...) are listed at the bottom.')
  lines.push('')
  lines.push(formatMembers(GLOBALS_NS?.members ?? []))
  lines.push('')
  lines.push('ES2020 Builtins (available without injection):')
  lines.push('  ' + ES2020_BUILTINS.join('  '))
  process.stdout.write(lines.join('\n') + '\n')
}
