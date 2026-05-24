import { listJobs, deleteJob, resolveJobId } from '../registry.js'
import { getProjectKey } from '../../project/index.js'

export async function handler({ id, projectDir, global: isGlobal }) {
  const key = isGlobal ? undefined : getProjectKey(projectDir)
  const jobs = await listJobs(key)

  let resolvedId
  try {
    resolvedId = resolveJobId(id, jobs)
  } catch (err) {
    console.error(`Error: ${err.message}`)
    process.exit(1)
  }

  const record = jobs.find(j => j.id === resolvedId)
  const recordKey = key ?? record.projectKey

  try { process.kill(record.pid, 'SIGTERM') } catch { /* already gone */ }
  await deleteJob(recordKey, record.id)
  console.log(`Sent SIGTERM to job ${record.id.slice(0, 8)} (${record.runeKey ?? 'unknown'})`)
}
