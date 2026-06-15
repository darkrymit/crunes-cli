import { listSqliteDbs, listLocalSqliteDbs } from '../index.js'

function pad(s, n) { return String(s ?? '-').padEnd(n) }

function applyPluginFilter(dbs, plugin) {
  if (plugin === undefined) return dbs
  const pluginScopes = new Set(['global-plugin', 'local-plugin'])
  if (plugin === true) return dbs.filter(d => pluginScopes.has(d.scope))
  return dbs.filter(d => pluginScopes.has(d.scope) && d.pluginId === plugin)
}

export async function handler({ projectDir, plugin }) {
  const [local, global] = await Promise.all([
    listLocalSqliteDbs(projectDir),
    listSqliteDbs(),
  ])
  let dbs = applyPluginFilter([...local, ...global], plugin)

  if (dbs.length === 0) { console.log('No SQLite databases.'); return }

  function pluginLabel(entry) {
    if (entry.scope === 'global-plugin' || entry.scope === 'local-plugin') return entry.pluginId ?? '-'
    return '-'
  }

  const cols = ['KEY', 'NAME', 'SCOPE', 'PLUGIN', 'FIRST SEEN']
  const rows = dbs.map(d => [d.key, d.name, d.scope, pluginLabel(d), d.firstSeenAt ? new Date(d.firstSeenAt).toLocaleString() : '-'])
  const widths = cols.map((c, i) => Math.max(c.length, ...rows.map(r => String(r[i] ?? '').length)))
  console.log(cols.map((c, i) => pad(c, widths[i])).join('  '))
  console.log(widths.map(w => '-'.repeat(w)).join('  '))
  for (const row of rows) {
    console.log(row.map((cell, i) => pad(cell, widths[i])).join('  '))
  }
}
