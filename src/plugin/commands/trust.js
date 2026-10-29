import { readFileSync } from 'node:fs'
import * as p from '@clack/prompts'
import { loadRegistry, resolvePluginKey } from '../registry.js'
import { loadPluginJson } from '../manifest.js'
import { isNativeRune, nativeRuneFile, trustDigest, trustState, recordTrust } from '../native.js'
import { blockOf } from '../../core/rune-entry.js'

const SHOWN_LINES = 80

/** What a native plugin rune runs, and — for a script — what the script says. */
export function describeForReview(pluginKey, runeKey, rune, pluginDir, state) {
  const run = blockOf(rune, 'run')
  const file = nativeRuneFile(pluginDir, rune)
  const lines = [
    `${pluginKey}:${runeKey} — ${state === 'changed' ? 'CHANGED since it was trusted' : state}`,
    `  runs natively, outside the sandbox, with your full access`,
    `  command: ${[run.command, ...(run.argv ?? [])].join(' ')}${file ? '' : '  (a program on PATH)'}`,
  ]
  if (rune.args != null) lines.push(`  arguments: ${run.pass === 'mapped' ? 'mapped from its schema — nothing else reaches the program' : 'passed through as given'}`)
  if (file) {
    let content
    try { content = readFileSync(file, 'utf8') } catch { content = null }
    lines.push(`  file: ${file}`, '')
    if (content == null) {
      lines.push('  (the file is missing)')
    } else {
      const all = content.replace(/\n$/, '').split('\n')
      for (const line of all.slice(0, SHOWN_LINES)) lines.push(`  │ ${line}`)
      if (all.length > SHOWN_LINES) lines.push(`  │ … ${all.length - SHOWN_LINES} more lines — read the whole file before trusting it`)
    }
  }
  return lines.join('\n')
}

export async function handler({ name, rune: onlyRune = null, yes = false }) {
  try {
    const registry = await loadRegistry()
    const pluginKey = resolvePluginKey(name, registry)
    const entry = pluginKey && registry.plugins[pluginKey]
    if (!entry) throw new Error(`Plugin "${name}" is not installed. Run: crunes plugin list`)
    const pluginJson = await loadPluginJson(entry.path)

    let natives = Object.entries(pluginJson.runes).filter(([, rune]) => isNativeRune(rune))
    if (onlyRune) {
      if (!pluginJson.runes[onlyRune]) throw new Error(`Plugin "${pluginKey}" has no rune "${onlyRune}"`)
      natives = natives.filter(([key]) => key === onlyRune)
      if (!natives.length) throw new Error(`"${pluginKey}:${onlyRune}" runs in the sandbox under its declared permissions — there is nothing to trust`)
    }
    if (!natives.length) {
      console.log(`Plugin "${pluginKey}" has no native runes — every rune runs in the sandbox.`)
      return
    }

    const pending = []
    for (const [runeKey, rune] of natives) {
      const digest = trustDigest(entry.path, rune)
      const state = trustState(entry, runeKey, digest)
      console.log(describeForReview(pluginKey, runeKey, rune, entry.path, state) + '\n')
      if (state !== 'trusted') pending.push({ runeKey, digest })
    }
    if (!pending.length) {
      console.log('Every native rune is already trusted in its current form.')
      return
    }

    if (!yes) {
      if (!process.stdout.isTTY) {
        throw new Error('Trusting a native rune is a decision to make after reading it. Run this in a terminal, or pass -y (crunes -y plugin trust …) once you have reviewed it.')
      }
      const answer = await p.confirm({ message: `Trust ${pending.length === 1 ? 'this rune' : `these ${pending.length} runes`} to run with your full access?` })
      if (p.isCancel(answer) || answer !== true) {
        console.log('Not trusted.')
        return
      }
    }
    for (const { runeKey, digest } of pending) await recordTrust(pluginKey, runeKey, digest)
    console.log(`Trusted ${pending.map(t => `${pluginKey}:${t.runeKey}`).join(', ')}. A change to what ${pending.length === 1 ? 'it runs' : 'they run'} needs trusting again.`)
  } catch (err) {
    console.error(`Error: ${err.message}`)
    process.exit(1)
  }
}
