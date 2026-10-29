import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join, isAbsolute } from 'node:path'
import { blockOf } from '../core/rune-entry.js'
import { isPathCommand } from '../shared/command.js'
import { loadRegistry, saveRegistry } from './registry.js'

const ISOLATE_MODULE = /\.rune\.m?js$/i

/** A plugin rune whose run block names a script or program: it runs outside the sandbox. */
export function isNativeRune(rune) {
  const command = blockOf(rune, 'run')?.command
  return typeof command === 'string' && !ISOLATE_MODULE.test(command)
}

/** The file a native plugin rune runs, or null when it names a program on PATH. */
export function nativeRuneFile(pluginDir, rune) {
  const { command } = blockOf(rune, 'run')
  if (!isPathCommand(command)) return null
  return isAbsolute(command) ? command : join(pluginDir, command)
}

/**
 * What trust is granted to: the run block as declared, the argument schema in front of it,
 * and the content of the script it names. Any change to any of them is a different rune.
 */
export function trustDigest(pluginDir, rune) {
  const hash = createHash('sha256')
  hash.update(JSON.stringify({ run: blockOf(rune, 'run'), args: rune.args ?? null }))
  const file = nativeRuneFile(pluginDir, rune)
  if (file) {
    try { hash.update(readFileSync(file)) } catch { hash.update('missing') }
  }
  return hash.digest('hex')
}

/** 'trusted', 'untrusted' (never trusted), or 'changed' (trusted, but not in this form). */
export function trustState(registryEntry, runeKey, digest) {
  const trusted = registryEntry?.trustedNative?.[runeKey]
  if (!trusted) return 'untrusted'
  return trusted.digest === digest ? 'trusted' : 'changed'
}

export async function recordTrust(pluginKey, runeKey, digest) {
  const registry = await loadRegistry()
  const entry = registry.plugins?.[pluginKey]
  if (!entry) throw new Error(`Plugin "${pluginKey}" is not installed`)
  entry.trustedNative = { ...(entry.trustedNative ?? {}), [runeKey]: { digest, at: new Date().toISOString() } }
  await saveRegistry(registry)
}

/** The refusal for a native plugin rune that has not been trusted in its current form. */
export function untrustedError(pluginKey, runeKey, state) {
  const shortName = pluginKey.slice(pluginKey.indexOf('@') + 1)
  const why = state === 'changed'
    ? `has changed since it was trusted — its script, command or schema is not what was reviewed`
    : `runs natively, outside the sandbox, with your full access, and has not been trusted`
  return new Error(
    `Plugin rune "${pluginKey}:${runeKey}" ${why}.\n` +
    `Review what it runs and trust it with: crunes plugin trust ${shortName} ${runeKey}`
  )
}
