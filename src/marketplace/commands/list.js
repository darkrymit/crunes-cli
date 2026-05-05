import { listMarketplaces } from '../marketplace.js'

export async function handler() {
  const sources = await listMarketplaces()
  if (sources.length === 0) {
    console.log('No marketplace sources configured.')
    return
  }
  for (const { source, name } of sources) {
    console.log(name ? `${name}  ${source}` : source)
  }
}
