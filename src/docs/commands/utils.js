import utilsApiData from '../generated/utils-api.json' assert { type: 'json' }
import { walkUtilsDocs } from '../utils-walker.js'
import { formatUtilsIndex, formatUtilsNamespace } from '../utils-formatter.js'
import { output } from '../../shared/output.js'

const ALL_NAMESPACES = walkUtilsDocs(utilsApiData)

export async function handler({ namespaces = [], format = 'text' } = {}) {
  let anyFailed = false

  const targets = namespaces.length === 0
    ? ALL_NAMESPACES
    : namespaces.map(name => {
        const ns = ALL_NAMESPACES.find(n => n.namespace === name)
        if (!ns) { output.warn(`Unknown utils namespace: "${name}"`); anyFailed = true }
        return ns
      }).filter(Boolean)

  if (format === 'json') {
    process.stdout.write(JSON.stringify(targets, null, 2) + '\n')
  } else {
    if (namespaces.length === 0) {
      process.stdout.write(formatUtilsIndex(targets) + '\n')
    } else {
      const blocks = targets.map(formatUtilsNamespace)
      if (blocks.length > 0) process.stdout.write(blocks.join('\n\n') + '\n')
    }
  }

  if (anyFailed) process.exit(1)
}
