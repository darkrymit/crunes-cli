import { searchMarketplaces } from '../marketplace.js'

export async function handler({ format = 'md' }) {
  const results = await searchMarketplaces('')

  if (results.length === 0) {
    console.log('No plugins found in configured marketplaces.')
    return
  }

  if (format === 'json') {
    console.log(JSON.stringify(results, null, 2))
    return
  }

  let currentMarketplace = null
  for (const plugin of results) {
    if (plugin._marketplace !== currentMarketplace) {
      currentMarketplace = plugin._marketplace
      console.log(`\n${currentMarketplace}`)
    }
    const desc = plugin.description ? `  — ${plugin.description}` : ''
    console.log(`  ${plugin.name}${desc}`)
  }
}
