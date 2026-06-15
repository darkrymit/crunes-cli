import { clearCacheBucket } from '../index.js'

export async function handler({ id, projectDir }) {
  let result
  try {
    result = await clearCacheBucket(id)
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
