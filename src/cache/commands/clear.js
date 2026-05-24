import { clearCacheBucket } from '../index.js'
import { getProjectKey } from '../../project/index.js'

export async function handler({ id, projectDir, global: isGlobal }) {
  const key = isGlobal ? undefined : getProjectKey(projectDir)
  let result
  try {
    result = await clearCacheBucket(id, key)
  } catch (err) {
    console.error(`Error: ${err.message}`)
    process.exit(1)
  }
  if (result.removed === 0) {
    console.log(`No expired keys in "${result.name}".`)
  } else {
    console.log(`Removed ${result.removed} expired key${result.removed === 1 ? '' : 's'} from "${result.name}".`)
  }
}
