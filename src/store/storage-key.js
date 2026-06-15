import { createHash } from 'node:crypto'

function shortHash(str) {
  return createHash('sha1').update(str).digest('hex').slice(0, 8)
}

const KEY_MATERIALS = {
  'global-plugin':  ({ pluginId, name }) => `global-plugin|${pluginId}|${name}`,
  'local':          ({ projectId, name }) => `local|${projectId}|${name}`,
  'local-plugin':   ({ projectId, pluginId, name }) => `local-plugin|${projectId}|${pluginId}|${name}`,
}

export function storageKey(type, { projectId, pluginId, name }) {
  const materialFn = KEY_MATERIALS[type]
  if (!materialFn) throw new Error(`Unknown storage key type: ${type}`)
  return `${name}-${shortHash(materialFn({ projectId, pluginId, name }))}`
}
