const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1'])

export function isLoopbackHost(host) {
  return LOOPBACK.has(host)
}

export function matchHttpServerPermission(value, patterns) {
  const lastColon = value.lastIndexOf(':')
  if (lastColon === -1) return false
  const valueHost = value.slice(0, lastColon)
  const valuePort = value.slice(lastColon + 1)

  return patterns.some(pattern => {
    const lastPatColon = pattern.lastIndexOf(':')
    if (lastPatColon === -1) return false
    const patHost = pattern.slice(0, lastPatColon)
    const patPort = pattern.slice(lastPatColon + 1)
    return (patHost === '*' || patHost === valueHost) && (patPort === '*' || patPort === valuePort)
  })
}
