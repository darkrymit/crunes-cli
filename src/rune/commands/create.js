import { mkdir, writeFile, readFile, rename } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { intro, outro, text, select, cancel } from '@clack/prompts'
import { output } from '../../shared/output.js'

const VALID_FORMATS = ['tree', 'markdown']

export function template(key, format) {
  const imports = format === 'tree'
    ? `import { md, section, tree } from '@utils'`
    : `import { md, section } from '@utils'`

  const header = [
    `// permissions:`,
    `//   use:`,
    `//     allow: []  — add patterns like fs.read:./** if you use utils.fs`,
    `//     deny:  []`,
    ``,
    imports,
    ``,
    `// export async function args(b) {`,
    `//   return b`,
    `//     .option('-v, --verbose', 'Verbose output', false)`,
    `//     .build()`,
    `// }`,
    ``,
    `export async function use(args) {`,
    `  // args._         — positional arguments (string[])`,
    `  // args.verbose   — named flag (if args export is defined above)`,
    `  // utils.fs.cwd() — absolute path to the project root`,
  ].join('\n')

  if (format === 'tree') {
    return header + '\n' + [
      ``,
      `  const root = tree.node('${key}', 'Root description', [`,
      `    tree.node('child', 'Child description'),`,
      `  ]);`,
      `  return section.create('example-tree', { type: 'tree', root });`,
      `}`,
      ``,
    ].join('\n')
  }

  return header + '\n' + [
    ``,
    `  const content = [`,
    `    md.h3('${key}'),`,
    `    md.ul(['Replace with real data']),`,
    `  ].join('\\n');`,
    `  return section.create('example-md', { type: 'markdown', content });`,
    `}`,
    ``,
  ].join('\n')
}

export async function handler({
  key,
  format,
  path: runeRelPath,
  name,
  description,
  yes = false,
  projectRoot = process.cwd(),
  configRoot = projectRoot,
} = {}) {
  const isNonInteractive = yes || !process.stdout.isTTY

  if (isNonInteractive) {
    if (!key) {
      output.error('Missing required argument: <key>')
      process.exit(1)
    }
    if (!format || !VALID_FORMATS.includes(format)) {
      output.error(`Missing or invalid --format. Must be one of: ${VALID_FORMATS.join(', ')}`)
      process.exit(1)
    }
  } else {
    intro('crunes create')

    if (!key) {
      const result = await text({ message: 'Rune key?', validate: v => v ? undefined : 'Required' })
      if (result === Symbol.for('clack:cancel')) { cancel('Cancelled.'); return }
      key = result
    }

    if (!format) {
      const result = await select({
        message: 'Output format?',
        options: [
          { value: 'tree', label: 'tree', hint: 'hierarchical ASCII tree structure' },
          { value: 'markdown', label: 'markdown', hint: 'freeform markdown content' },
        ],
      })
      if (result === Symbol.for('clack:cancel')) { cancel('Cancelled.'); return }
      format = result
    }

    if (!runeRelPath) {
      const defaultPath = `.crunes/runes/${key}.js`
      const result = await text({ message: 'File path?', initialValue: defaultPath })
      if (result === Symbol.for('clack:cancel')) { cancel('Cancelled.'); return }
      runeRelPath = result
    }

    if (!name) {
      const result = await text({ message: 'Name? (optional)', placeholder: 'Human-readable label for crunes list' })
      if (result === Symbol.for('clack:cancel')) { cancel('Cancelled.'); return }
      name = result || undefined
    }

    if (!description) {
      const result = await text({ message: 'Description? (optional)', placeholder: 'What context does this rune provide?' })
      if (result === Symbol.for('clack:cancel')) { cancel('Cancelled.'); return }
      description = result || undefined
    }
  }

  runeRelPath = runeRelPath ?? `.crunes/runes/${key}.js`
  const runeAbsPath = join(configRoot, runeRelPath)

  await mkdir(dirname(runeAbsPath), { recursive: true })
  await writeFile(runeAbsPath, template(key, format))

  const configPath = join(configRoot, '.crunes', 'config.json')
  await mkdir(dirname(configPath), { recursive: true })
  let config = { runes: {} }
  try { config = JSON.parse(await readFile(configPath, 'utf8')) } catch {}
  const entry = {
    path: runeRelPath,
    ...(name && { name }),
    ...(description && { description }),
  }
  config.runes = { ...(config.runes ?? {}), [key]: entry }
  const tmpPath = configPath + '.tmp'
  await writeFile(tmpPath, JSON.stringify(config, null, 2) + '\n', 'utf8')
  await rename(tmpPath, configPath)

  if (!isNonInteractive) {
    outro(`Created ${runeRelPath}\nRun: crunes use ${key}`)
  } else {
    output.success(`Created ${runeRelPath}`)
    output.info(`Run: crunes use ${key}`)
  }
}
