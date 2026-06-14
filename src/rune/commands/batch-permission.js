import { isWildcardMatch } from '../../shared/match.js'

export function buildMatchString(key, args) {
  return args.length === 0 ? key : `${key} ${args.join(' ')}`
}

export function checkBatchPermission(entry, matchString) {
  const batch = entry?.batch
  if (!batch) return { allowed: false, reason: 'No batch block declared' }

  const deny  = batch.deny  ?? []
  const allow = batch.allow ?? []

  // Strip the leading key token — patterns match against "args..." or bare key if no args
  const spaceIdx = matchString.indexOf(' ')
  const subject = spaceIdx === -1 ? matchString : matchString.slice(spaceIdx + 1)

  if (deny.length > 0 && isWildcardMatch(subject, deny)) {
    return { allowed: false, reason: 'Matches deny pattern' }
  }
  if (allow.length > 0 && isWildcardMatch(subject, allow)) {
    return { allowed: true }
  }
  return { allowed: false, reason: 'No matching allow pattern' }
}
