import { listCacheBuckets, listLocalCacheBuckets } from '../index.js'

function pad(s, n) { return String(s ?? '-').padEnd(n) }

function applyPluginFilter(buckets, plugin) {
  if (plugin === undefined) return buckets
  const pluginScopes = new Set(['global-plugin', 'local-plugin'])
  if (plugin === true) return buckets.filter(b => pluginScopes.has(b.scope))
  return buckets.filter(b => pluginScopes.has(b.scope) && b.pluginId === plugin)
}

export async function handler({ projectDir, plugin }) {
  const [local, global] = await Promise.all([
    listLocalCacheBuckets(projectDir),
    listCacheBuckets(),
  ])
  let buckets = applyPluginFilter([...local, ...global], plugin)

  if (buckets.length === 0) {
    console.log('No cache buckets.')
    return
  }

  function pluginLabel(entry) {
    if (entry.scope === 'global-plugin' || entry.scope === 'local-plugin') return entry.pluginId ?? '-'
    return '-'
  }

  const cols = ['KEY', 'NAME', 'SCOPE', 'PLUGIN', 'FIRST SEEN']
  const rows = buckets.map(b => [
    b.key,
    b.name,
    b.scope,
    pluginLabel(b),
    b.firstSeenAt ? new Date(b.firstSeenAt).toLocaleString() : '-',
  ])
  const widths = cols.map((c, i) => Math.max(c.length, ...rows.map(r => String(r[i] ?? '').length)))
  console.log(cols.map((c, i) => pad(c, widths[i])).join('  '))
  console.log(widths.map(w => '-'.repeat(w)).join('  '))
  for (const row of rows) {
    console.log(row.map((cell, i) => pad(cell, widths[i])).join('  '))
  }
}
