import { listJobs, deleteJob, cleanJobs, getJob, projectKey } from '../../job/registry.js'

function isAlive(pid) {
  try { process.kill(pid, 0); return true } catch { return false }
}

function pad(str, len) {
  return String(str ?? '-').padEnd(len)
}

export async function listHandler({ projectDir, global: isGlobal }) {
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

export async function killHandler({ id, projectDir, global: isGlobal }) {
  const key = isGlobal ? undefined : projectKey(projectDir)

  let record = null
  let recordKey = null

  if (key) {
    record = await getJob(key, id)
    recordKey = key
  } else {
    const jobs = await listJobs()
    record = jobs.find(j => j.id === id) ?? null
    if (record) recordKey = record.projectKey
  }

  if (!record) {
    console.error(`Error: job ${id} not found`)
    process.exit(1)
  }

  try { process.kill(record.pid, 'SIGTERM') } catch { /* already gone */ }
  await deleteJob(recordKey, record.id)
  console.log(`Sent SIGTERM to job ${record.id.slice(0, 8)} (${record.runeKey ?? 'unknown'})`)
}
