import micromatch from 'micromatch'

export function matchWsPermission(url, pattern) {
  const patternBody = pattern.startsWith('ws.client:') ? pattern.slice(10) : pattern
  return micromatch.isMatch(url, patternBody)
}

export function matchWsServerPermission(value, pattern) {
  const body = pattern.startsWith('ws.server:') ? pattern.slice(10) : pattern

  // value: "<host>:<port>" or "<host>:<port>:<path>"
  // Split on colons; path always starts with /
  const colonIdx = value.indexOf(':')
  if (colonIdx === -1) return false
  const valueHost = value.slice(0, colonIdx)
  const rest = value.slice(colonIdx + 1)
  const secondColon = rest.indexOf(':')
  const valuePort = secondColon === -1 ? rest : rest.slice(0, secondColon)
  const valuePath = secondColon !== -1 ? rest.slice(secondColon + 1) : null

  const patColonIdx = body.indexOf(':')
  if (patColonIdx === -1) return false
  const patHost = body.slice(0, patColonIdx)
  const patRest = body.slice(patColonIdx + 1)
  const patSecondColon = patRest.indexOf(':')
  const patPort = patSecondColon === -1 ? patRest : patRest.slice(0, patSecondColon)
  const patPath = patSecondColon !== -1 ? patRest.slice(patSecondColon + 1) : null

  const hostOk = patHost === '*' || patHost === valueHost
  const portOk = patPort === '*' || patPort === valuePort

  let pathOk
  if (patPath === null) {
    pathOk = valuePath === null
  } else if (patPath === '*') {
    pathOk = valuePath !== null
  } else {
    pathOk = patPath === valuePath
  }

  return hostOk && portOk && pathOk
}
