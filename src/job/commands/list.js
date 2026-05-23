import { listJobs, cleanJobs, projectKey, isAlive } from '../registry.js'

function pad(str, len) {
  return String(str ?? '-').padEnd(len)
}

export async function handler({ projectDir, global: isGlobal }) {
  const key = isGlobal ? undefined : projectKey(projectDir)
  await cleanJobs(key)
  const jobs = await listJobs(key)

  if (jobs.length === 0) {
    console.log('No background jobs.')
    return
  }

  const header = isGlobal
    ? ['PROJECT', 'ID', 'RUNE', 'SPAWNED BY', 'STATUS', 'STARTED']
    : ['ID', 'RUNE', 'SPAWNED BY', 'STATUS', 'STARTED']

  const rows = jobs.map(r => {
    const row = [
      r.id.slice(0, 8),
      r.runeKey ?? '-',
      r.spawnedBy ?? '-',
      isAlive(r.pid) ? 'alive' : 'dead',
      new Date(r.startedAt).toLocaleString(),
    ]
    if (isGlobal) row.unshift(r.projectDir ?? '-')
    return row
  })

  const widths = header.map((h, i) =>
    Math.max(h.length, ...rows.map(r => String(r[i] ?? '').length))
  )

  console.log(header.map((h, i) => pad(h, widths[i])).join('  '))
  console.log(widths.map(w => '-'.repeat(w)).join('  '))
  for (const row of rows) {
    console.log(row.map((cell, i) => pad(cell, widths[i])).join('  '))
  }
}
