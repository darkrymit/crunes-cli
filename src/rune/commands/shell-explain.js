import { scanCommand, ScanRefusal } from '../permissions/shell-scan.js'
import { BUILTIN_ALLOWLIST } from '../permissions/shell-check.js'
import { resolveShell } from '../api/shell-resolve.js'

export function explain({ cmd, shellMode }) {
  const shell = resolveShell(shellMode).kind
  try {
    const { commands, redirects } = scanCommand(cmd, shell)
    return {
      shell,
      refusal: null,
      commands: commands.map(c => ({
        program: c.program,
        segment: c.segment,
        offset:  c.offset,
        builtin: BUILTIN_ALLOWLIST.has(c.program),
      })),
      redirects: redirects.map(r => ({
        capability: r.mode === 'write' ? 'fs.write' : 'fs.read',
        target:     r.target,
        offset:     r.offset,
      })),
    }
  } catch (e) {
    if (!(e instanceof ScanRefusal)) throw e
    return { shell, refusal: { construct: e.construct, offset: e.offset }, commands: [], redirects: [] }
  }
}

export async function handler({ cmd, shellMode }) {
  const r = explain({ cmd, shellMode })

  console.log(`shell: ${r.shell}`)
  console.log()

  if (r.refusal) {
    console.log(`REFUSED: ${r.refusal.construct} at offset ${r.refusal.offset}`)
    console.log()
    console.log(cmd)
    console.log(' '.repeat(r.refusal.offset) + '^')
    console.log()
    console.log('This construct cannot be classified, so it is denied. There is no')
    console.log('grant that overrides this. Rewrite the command without it.')
    process.exitCode = 1
    return
  }

  console.log('command positions:')
  for (const c of r.commands) {
    const tag = c.builtin ? 'builtin, no grant needed' : `needs shell.run:${c.segment}`
    console.log(`  @${String(c.offset).padStart(4)}  ${c.segment}`)
    console.log(`          ${tag}`)
  }

  if (r.redirects.length > 0) {
    console.log()
    console.log('redirects:')
    for (const rd of r.redirects) {
      console.log(`  @${String(rd.offset).padStart(4)}  ${rd.target}`)
      console.log(`          needs ${rd.capability}:${rd.target}`)
    }
  }
}
