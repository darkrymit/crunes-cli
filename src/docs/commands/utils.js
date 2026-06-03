import utilsApiData from '../generated/utils-api.json' assert { type: 'json' }
import { walk } from '../ts-walker.js'
import { formatNode } from '../ts-formatter.js'
import { output } from '../../shared/output.js'

const ALL_NAMESPACES = walk(utilsApiData)

function formatIndex(namespaces) {
  const lines = ['Available utils namespaces:', '']
  for (const ns of namespaces) {
    lines.push(`  ${ns.name}  ${ns.description ?? ''}`.trimEnd())
  }
  return lines.join('\n')
}

export async function handler({ namespaces = [], format = 'text' } = {}) {
  let anyFailed = false

  const targets = namespaces.length === 0
    ? ALL_NAMESPACES
    : namespaces.map(name => {
        const ns = ALL_NAMESPACES.find(n => n.name === name)
        if (!ns) { output.warn(`Unknown utils namespace: "${name}"`); anyFailed = true }
        return ns
      }).filter(Boolean)

  if (format === 'json') {
    process.stdout.write(JSON.stringify(targets, null, 2) + '\n')
  } else {
    if (namespaces.length === 0) {
      process.stdout.write(formatIndex(targets) + '\n')
    } else {
      const blocks = targets.map(ns => formatNode(ns))
      if (blocks.length > 0) process.stdout.write(blocks.join('\n\n') + '\n')
    }
  }

  if (anyFailed) process.exit(1)
}
