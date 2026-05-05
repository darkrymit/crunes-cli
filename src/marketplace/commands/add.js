import { addMarketplace } from '../marketplace.js'

export async function handler({ url }) {
  try {
    await addMarketplace(url)
    console.log(`Marketplace "${url}" added.`)
  } catch (err) {
    console.error(`Error: ${err.message}`)
    process.exit(1)
  }
}
