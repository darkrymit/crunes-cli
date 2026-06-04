import { fs, section, md, tree } from '@utils'

const SRC_ROOT = 'src'

export async function args(b) {
  return b
    .positional('[module]', 'Module path to inspect (dot-separated submodule, e.g. rune.isolation). Omit for all modules.')
    .build()
}

export async function run(args) {
  if (!await fs.exists(SRC_ROOT)) return null

  if (args._.length === 0) {
    const data = await buildRootMarkdown()
    return section.create('layout', data, { title: 'All Modules', attrs: { rune: 'm' } })
  }

  if (args._.length > 1) {
    const allSections = await Promise.all(args._.map(arg => generateForPath(arg.split('.'))))
    return allSections.flat()
  }

  return generateForPath(args._[0].split('.'))
}

async function generateForPath(pathSegments) {
  const targetRel = [SRC_ROOT, ...pathSegments].join('/')
  if (!await fs.exists(targetRel)) {
    return section.create('layout', {
      type: 'markdown',
      content: md.ul([`not found: \`src/${pathSegments.join('/')}\``]),
    }, { title: 'All Modules', attrs: { rune: 'm' } })
  }

  const modulePath = pathSegments.join('/')
  const attrs = { rune: 'm', module: modulePath }
  const sections = []

  const layoutData = await buildTree(targetRel, pathSegments[pathSegments.length - 1])
  sections.push(section.create('layout', layoutData, { title: `Module Layout: ${modulePath}`, attrs }))

  const filesData = await buildFileTree(targetRel)
  sections.push(section.create('files', filesData, { title: `Module Files: ${modulePath}`, attrs: { ...attrs, path: targetRel } }))

  const readmeData = await buildReadmeSection(targetRel)
  sections.push(section.create('readme', readmeData, { title: `Module Readme: ${modulePath}`, attrs }))

  return sections
}

async function buildRootMarkdown() {
  const dirs = await listImmediateDirs(SRC_ROOT)
  if (dirs.length === 0) return null

  const items = await Promise.all(dirs.map(async (name) => {
    const readmePath = `${SRC_ROOT}/${name}/README.md`
    const readmeExists = await fs.exists(readmePath)
    const desc = readmeExists ? await extractDescription(readmePath) : ''
    return desc
      ? `${md.bold(name)} — ${desc}`
      : md.bold(name)
  }))

  return { type: 'markdown', content: md.ul(items) }
}

async function buildTree(targetRel, rootName) {
  const readmePath = `${targetRel}/README.md`
  const desc = await fs.exists(readmePath) ? await extractDescription(readmePath) : ''
  return {
    type: 'tree',
    root: tree.node(rootName, desc, await buildChildren(targetRel)),
  }
}

async function buildReadmeSection(targetRel) {
  const readmePath = `${targetRel}/README.md`
  const content = await fs.read(readmePath, { throw: false })
  if (!content) return { type: 'markdown', content: '_No README found for this module._' }
  return { type: 'markdown', content: content.trim() }
}

async function buildFileTree(targetRel) {
  const entries = await fs.glob(`${targetRel}/**/*.js`)
  const prefix = `${targetRel}/`
  const paths = entries
    .sort()
    .map(e => e.startsWith(prefix) ? e.slice(prefix.length) : e)
  const content = `// base: ${targetRel}/\n${paths.join('\n')}`
  return { type: 'markdown', content }
}

async function buildChildren(parentRel) {
  const dirs = await listImmediateDirs(parentRel)
  return Promise.all(dirs.map(async (name) => {
    const childRel = `${parentRel}/${name}`
    const readmePath = `${childRel}/README.md`
    const desc = await fs.exists(readmePath) ? await extractDescription(readmePath) : ''
    return tree.node(name, desc, await buildChildren(childRel))
  }))
}

async function listImmediateDirs(relPath) {
  const entries = await fs.glob(`${relPath}/*`, { onlyDirectories: true })
  return entries
    .map(e => e.replace(/\/$/, '').split('/').pop())
    .filter(Boolean)
    .sort()
}

async function extractDescription(readmePath) {
  const content = await fs.read(readmePath, { throw: false })
  if (!content) return ''
  const line = content.split('\n')[2] ?? ''
  return line.trim().replace(/\s+Full docs:.*$/, '')
}
