import { listJobs, cleanJobs, isAlive } from '../registry.js'

function pad(str, len) {
  return String(str ?? '-').padEnd(len)
}

export async function handler({ projectDir }) {
  await cleanJobs(projectDir)
  const jobs = await listJobs(projectDir)

  if (jobs.length === 0) {
    console.log('No background jobs.')
    return
  }

  const header = ['ID', 'RUNE', 'SPAWNED BY', 'STATUS', 'STARTED']

  const rows = jobs.map(r => [
    r.id.slice(0, 8),
    r.runeKey ?? '-',
    r.spawnedBy ?? '-',
    isAlive(r.pid) ? 'alive' : 'dead',
    new Date(r.startedAt).toLocaleString(),
  ])

  const widths = header.map((h, i) =>
    Math.max(h.length, ...rows.map(r => String(r[i] ?? '').length))
  )

  console.log(header.map((h, i) => pad(h, widths[i])).join('  '))
  console.log(widths.map(w => '-'.repeat(w)).join('  '))
  for (const row of rows) {
    console.log(row.map((cell, i) => pad(cell, widths[i])).join('  '))
  }
}
