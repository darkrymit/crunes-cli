import { updateMarketplace, listMarketplaces } from '../marketplace.js'

export async function handler({ url }) {
  try {
    if (url) {
      await updateMarketplace(url)
      console.log(`Marketplace "${url}" updated.`)
    } else {
      const sources = await listMarketplaces()
      if (sources.length === 0) {
        console.log('No marketplaces configured.')
        return
      }
      for (const source of sources) {
        try {
          await updateMarketplace(source)
          console.log(`Updated: ${source}`)
        } catch (err) {
          console.error(`Warning: could not update "${source}": ${err.message}`)
        }
      }
    }
  } catch (err) {
    console.error(`Error: ${err.message}`)
    process.exit(1)
  }
}
