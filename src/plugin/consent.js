import * as p from '@clack/prompts'

function collectAllow(permissions) {
  const all = []
  for (const lifecycle of Object.values(permissions ?? {})) {
    for (const perm of lifecycle?.allow ?? []) {
      if (!all.includes(perm)) all.push(perm)
    }
  }
  return all
}

export function formatConsentScreen(pluginName, pluginJson) {
  const lines = [`${pluginName} requests the following permissions:\n`]

  for (const [runeKey, rune] of Object.entries(pluginJson.runes)) {
    const allow = collectAllow(rune.permissions)
    if (allow.length === 0) continue
    lines.push(`  ${runeKey}`)
    for (const perm of allow) {
      lines.push(`          ${perm}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

export async function promptConsent(pluginName, pluginJson, { yes = false } = {}) {
  const isYes = yes || !process.stdout.isTTY
  if (isYes) return true

  p.note(formatConsentScreen(pluginName, pluginJson), 'Permissions requested')

  const answer = await p.confirm({ message: 'Allow these permissions?' })

  if (p.isCancel(answer)) return false
  return answer === true
}

export function diffPermissions(oldConsented, newPluginJson) {
  const added = {}
  for (const [runeKey, rune] of Object.entries(newPluginJson.runes)) {
    const newPerms = collectAllow(rune.permissions)
    const oldPerms = oldConsented[runeKey] ?? []
    const newOnes  = newPerms.filter(perm => !oldPerms.includes(perm))
    if (newOnes.length > 0) added[runeKey] = newOnes
  }
  return added
}

export async function promptReConsent(pluginName, diff, { yes = false } = {}) {
  const isYes = yes || !process.stdout.isTTY
  if (isYes) return true

  const lines = [`${pluginName} has added new permissions:\n`]
  for (const [runeKey, perms] of Object.entries(diff)) {
    lines.push(`  ${runeKey}`)
    for (const perm of perms) {
      lines.push(`          ${perm}`)
    }
    lines.push('')
  }

  p.note(lines.join('\n'), 'New permissions')

  const answer = await p.confirm({ message: 'Allow these new permissions?' })
  if (p.isCancel(answer)) return false
  return answer === true
}
