import * as p from '@clack/prompts'
import { deleteCacheBucket } from '../index.js'
import { getProjectKey } from '../../project/index.js'

export async function handler({ id, yes, projectDir, global: isGlobal }) {
  if (!yes) {
    const confirm = await p.confirm({ message: `Delete cache bucket matching "${id}"?` })
    if (p.isCancel(confirm) || !confirm) {
      p.cancel('Cancelled.')
      process.exit(0)
    }
  }
  const key = isGlobal ? undefined : getProjectKey(projectDir)
  let result
  try {
    result = await deleteCacheBucket(id, key)
  } catch (err) {
    console.error(`Error: ${err.message}`)
    process.exit(1)
  }
  console.log(`Deleted cache bucket "${result.name}".`)
}
