import { fs, section, md } from '@utils'

const TYPE_DIRS   = { m: 'modules', f: 'flows', s: 'system' }
const TYPE_LABELS   = { m: 'Modules', f: 'Flows', s: 'System' }
const TYPE_SINGULAR = { m: 'Module',  f: 'Flow',  s: 'System' }
const KB_ROOT = 'docs/knowledge-base'

export async function args(b) {
  return b
    .option('-m, --modules', 'Show module KB entries (default when names given)')
    .option('-f, --flows', 'Show flow KB entries')
    .option('-s, --system', 'Show system KB entries')
    .positional('[name]', 'Entry name(s) to fetch in full. Multiple names are space-separated.')
    .build()
}

export async function run(args) {
  if (!await fs.exists(KB_ROOT)) return null

  const hasNames = args._.length > 0
  const type = args.flows ? 'f' : args.system ? 's' : (args.modules || hasNames) ? 'm' : null

  if (!type) return buildRoot()

  return buildTypeSection(type, args._)
}

async function buildRoot() {
  const sections = []
  for (const type of Object.keys(TYPE_DIRS)) {
    const result = await buildTypeSection(type, [])
    if (result) sections.push(...result)
  }
  return sections.length > 0 ? sections : null
}

async function buildTypeSection(type, allowedNames) {
  const dirPath = `${KB_ROOT}/${TYPE_DIRS[type]}`
  let files = await fs.glob('*.md', { cwd: dirPath })
  if (!files || files.length === 0) return null

  files = files.map(f => f.replace(/\.md$/, '')).sort()

  if (allowedNames.length > 0) {
    files = files.filter(name => allowedNames.includes(name))
  }

  if (files.length === 0) return null

  const baseAttrs = { rune: 'kb', type: TYPE_DIRS[type] }

  if (allowedNames.length === 0) {
    const items = await Promise.all(files.map(async (name) => ({
      name,
      description: await extractDescription(`${dirPath}/${name}.md`),
    })))
    const content = md.ul(
      items.map(({ name, description }) =>
        description ? `${md.bold(name)} — ${description}` : md.bold(name)
      )
    )
    return [section.create('knowledge-base',
      { type: 'markdown', content },
      { title: TYPE_LABELS[type], attrs: baseAttrs }
    )]
  }

  const contentSections = await Promise.all(files.map(async (name) => {
    const raw = await fs.read(`${dirPath}/${name}.md`, { throw: false })
    const content = raw ? raw.trim() : `_No content found for \`${name}\`._`
    return section.create(name,
      { type: 'markdown', content },
      { title: `Knowledge Base ${TYPE_SINGULAR[type]}: ${name}`, attrs: { ...baseAttrs, entry: name } }
    )
  }))

  return contentSections
}

async function extractDescription(relPath) {
  const content = await fs.read(relPath, { throw: false })
  if (!content) return ''
  const lines = content.split('\n')
  let dashCount = 0
  let frontmatterDone = false
  for (const line of lines) {
    const trimmed = line.trim()
    if (!frontmatterDone && trimmed === '---') {
      dashCount++
      if (dashCount === 2) frontmatterDone = true
      continue
    }
    if (dashCount === 1) continue
    if (trimmed.startsWith('> ')) return trimmed.slice(2).trim()
  }
  return ''
}
