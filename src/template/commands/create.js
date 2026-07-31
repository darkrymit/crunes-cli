import { mkdir, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { intro, outro, text, cancel } from '@clack/prompts'
import { output } from '../../shared/output.js'
import { getConfigPath, readRawConfig, writeRawConfig } from '../../core/config-writer.js'
import { getStorePath } from '../../store/index.js'

export function templateStub(name) {
  return [
    `// permissions:`,
    `//   run:`,
    `//     allow: []  — add patterns like fs.read:./** if you use utils.fs`,
    `//     deny:  []`,
    ``,
    `import { md, section } from '@utils'`,
    ``,
    `// export async function args(b) {`,
    `//   return b`,
    `//     .option('-v, --verbose', 'Verbose output', false)`,
    `//     .build()`,
    `// }`,
    ``,
    `export async function run(args) {`,
    `  // args._         — data positionals (command tokens stripped)`,
    `  // args.$rest     — unmapped positional arguments`,
    `  // args.verbose   — named flag (if args export is defined above)`,
    `  // utils.fs.cwd() — absolute path to the project root`,
    ``,
    `  const content = [`,
    `    md.h3('${name}'),`,
    `    md.ul(['Replace with real output']),`,
    `  ].join('\\n');`,
    `  return section.create('example-md', { type: 'markdown', content });`,
    `}`,
    ``,
  ].join('\n')
}

export async function handler({
  name,
  path: templateRelPath,
  templateName,
  description,
  yes = false,
  projectRoot = process.cwd(),
  configRoot = projectRoot,
  global = false,
} = {}) {
  const isNonInteractive = yes || !process.stdout.isTTY

  if (isNonInteractive) {
    if (!name) {
      output.error('Missing required argument: <name>')
      process.exit(1)
    }
  } else {
    intro('crunes template create')

    if (!name) {
      const result = await text({ message: 'Template name?', validate: v => v ? undefined : 'Required' })
      if (result === Symbol.for('clack:cancel')) { cancel('Cancelled.'); return }
      name = result
    }

    if (!templateRelPath) {
      const defaultPath = global ? `templates/${name}.js` : `.crunes/templates/${name}.js`
      const result = await text({ message: 'File path?', initialValue: defaultPath })
      if (result === Symbol.for('clack:cancel')) { cancel('Cancelled.'); return }
      templateRelPath = result
    }

    if (!templateName) {
      const result = await text({ message: 'Display name? (optional)', placeholder: 'Human-readable label for crunes template list' })
      if (result === Symbol.for('clack:cancel')) { cancel('Cancelled.'); return }
      templateName = result || undefined
    }

    if (!description) {
      const result = await text({ message: 'Description? (optional)', placeholder: 'What kind of rune does this template produce?' })
      if (result === Symbol.for('clack:cancel')) { cancel('Cancelled.'); return }
      description = result || undefined
    }
  }

  templateRelPath = templateRelPath ?? (global ? `templates/${name}.js` : `.crunes/templates/${name}.js`)
  const baseRoot = global ? getStorePath() : configRoot
  const templateAbsPath = join(baseRoot, templateRelPath)

  await mkdir(dirname(templateAbsPath), { recursive: true })
  await writeFile(templateAbsPath, templateStub(name))

  const configPath = getConfigPath({ configRoot, global })
  const config = readRawConfig(configPath) ?? { runes: {} }

  const entry = {
    path: templateRelPath,
    ...(templateName && { name: templateName }),
    ...(description && { description }),
  }
  config.templates = { ...(config.templates ?? {}), [name]: entry }
  await writeRawConfig(configPath, config)

  if (!isNonInteractive) {
    outro(`Created ${templateRelPath}\nUse it with: crunes template apply ${name}`)
  } else {
    output.success(`Created ${templateRelPath}`)
    output.info(`Use it with: crunes template apply ${name}`)
  }
}
