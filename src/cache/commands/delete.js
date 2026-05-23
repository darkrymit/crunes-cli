import * as p from '@clack/prompts'
import { deleteCacheBucket } from '../index.js'

export async function handler({ id, yes }) {
  if (!yes) {
    const confirm = await p.confirm({ message: `Delete cache bucket matching "${id}"?` })
    if (p.isCancel(confirm) || !confirm) {
      p.cancel('Cancelled.')
      process.exit(0)
    }
  }
  let result
  try {
    result = await deleteCacheBucket(id)
  } catch (err) {
    console.error(`Error: ${err.message}`)
    process.exit(1)
  }
  console.log(`Deleted cache bucket "${result.name}".`)
}
