import { searchMarketplaces } from '../marketplace.js'

export async function handler({ query }) {
  const results = await searchMarketplaces(query)

  if (results.length === 0) {
    console.log(`No plugins found matching "${query}".`)
    return
  }

  for (const plugin of results) {
    const desc = plugin.description ? `  ${plugin.description}` : ''
    console.log(`${plugin.name}${plugin.version ? `@${plugin.version}` : ''}${desc}`)
    if (plugin.source) console.log(`    ${plugin.source}`)
  }
}
