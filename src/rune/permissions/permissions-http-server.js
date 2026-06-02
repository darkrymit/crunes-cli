const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1'])

export function isLoopbackHost(host) {
  return LOOPBACK.has(host)
}

export function matchHttpServerPermission(value, pattern) {
  const body = pattern.startsWith('http.server:') ? pattern.slice(12) : pattern
  // value: "<host>:<port>", body: "<host>:<port>"
  const lastColon = value.lastIndexOf(':')
  if (lastColon === -1) return false
  const valueHost = value.slice(0, lastColon)
  const valuePort = value.slice(lastColon + 1)

  const lastPatColon = body.lastIndexOf(':')
  if (lastPatColon === -1) return false
  const patHost = body.slice(0, lastPatColon)
  const patPort = body.slice(lastPatColon + 1)

  const hostOk = patHost === '*' || patHost === valueHost
  const portOk = patPort === '*' || patPort === valuePort
  return hostOk && portOk
}
