import { isGlobMatch } from '../../shared/match.js'

export function matchWsPermission(url, patterns) {
  return isGlobMatch(url, patterns)
}

export function matchWsServerPermission(value, patterns) {
  // value: "<host>:<port>" or "<host>:<port>:<path>"
  const colonIdx = value.indexOf(':')
  if (colonIdx === -1) return false
  const valueHost = value.slice(0, colonIdx)
  const rest = value.slice(colonIdx + 1)
  const secondColon = rest.indexOf(':')
  const valuePort = secondColon === -1 ? rest : rest.slice(0, secondColon)
  const valuePath = secondColon !== -1 ? rest.slice(secondColon + 1) : null

  return patterns.some(pattern => {
    const patColonIdx = pattern.indexOf(':')
    if (patColonIdx === -1) return false
    const patHost = pattern.slice(0, patColonIdx)
    const patRest = pattern.slice(patColonIdx + 1)
    const patSecondColon = patRest.indexOf(':')
    const patPort = patSecondColon === -1 ? patRest : patRest.slice(0, patSecondColon)
    const patPath = patSecondColon !== -1 ? patRest.slice(patSecondColon + 1) : null

    const hostOk = patHost === '*' || patHost === valueHost
    const portOk = patPort === '*' || patPort === valuePort
    const pathOk = patPath === null ? valuePath === null
      : patPath === '*' ? valuePath !== null
      : patPath === valuePath
    return hostOk && portOk && pathOk
  })
}
