import { removeMarketplace } from '../marketplace.js'

export async function handler({ url }) {
  try {
    await removeMarketplace(url)
    console.log(`Marketplace "${url}" removed.`)
  } catch (err) {
    console.error(`Error: ${err.message}`)
    process.exit(1)
  }
}
