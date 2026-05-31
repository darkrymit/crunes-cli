import { listCacheBuckets, listLocalCacheBuckets } from '../index.js'
import { ensureProjectIdentity, loadProjects } from '../../project/index.js'

function pad(s, n) { return String(s ?? '-').padEnd(n) }

function applyPluginFilter(buckets, plugin) {
  if (plugin === undefined) return buckets
  const pluginScopes = new Set(['global-plugin', 'global-project-plugin', 'local-project-plugin'])
  if (plugin === true) {
    return buckets.filter(b => pluginScopes.has(b.scope))
  }
  return buckets.filter(b => pluginScopes.has(b.scope) && b.pluginId === plugin)
}

export async function handler({ projectDir, global: isGlobal, plugin }) {
  let buckets

  if (isGlobal) {
    buckets = await listCacheBuckets()
  } else {
    const { id: projectId } = await ensureProjectIdentity(projectDir)
    const [local, global] = await Promise.all([
      listLocalCacheBuckets(projectDir),
      listCacheBuckets(projectId),
    ])
    buckets = [...local, ...global]
  }

  buckets = applyPluginFilter(buckets, plugin)

  let projectAliases = {}
  if (isGlobal) {
    const { projects } = await loadProjects()
    for (const [id, entry] of Object.entries(projects)) {
      projectAliases[id] = typeof entry === 'object' ? (entry.alias ?? entry.path) : entry
    }
  }

  if (buckets.length === 0) {
    console.log('No cache buckets.')
    return
  }

  function projectPlugin(entry) {
    if (entry.scope === 'global-project' || entry.scope === 'local-project') {
      return projectAliases[entry.projectKey] ?? entry.projectKey ?? '-'
    }
    if (entry.scope === 'global-plugin') return entry.pluginId ?? '-'
    if (entry.scope === 'global-project-plugin' || entry.scope === 'local-project-plugin') {
      const proj = projectAliases[entry.projectKey] ?? entry.projectKey
      return `${proj}/${entry.pluginId}`
    }
    return '-'
  }

  const cols = ['KEY', 'NAME', 'SCOPE', 'PROJECT/PLUGIN', 'FIRST SEEN']
  const rows = buckets.map(b => [
    b.key,
    b.name,
    b.scope,
    projectPlugin(b),
    b.firstSeenAt ? new Date(b.firstSeenAt).toLocaleString() : '-',
  ])
  const widths = cols.map((c, i) => Math.max(c.length, ...rows.map(r => String(r[i] ?? '').length)))
  console.log(cols.map((c, i) => pad(c, widths[i])).join('  '))
  console.log(widths.map(w => '-'.repeat(w)).join('  '))
  for (const row of rows) {
    console.log(row.map((cell, i) => pad(cell, widths[i])).join('  '))
  }
}
