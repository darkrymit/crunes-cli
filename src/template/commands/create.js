import { mkdir, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { intro, outro, text, cancel, isCancel } from '@clack/prompts'
import { output } from '../../shared/output.js'
import { getConfigPath, readRawConfig, writeRawConfig } from '../../core/config-writer.js'
import { getStorePath } from '../../store/index.js'
import { runeTestTemplate, SCRIPT_LANGS, VALID_LANGS } from '../../rune/commands/create.js'

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
  lang,
  templateName,
  description,
  yes = false,
  projectRoot = process.cwd(),
  configRoot = projectRoot,
  global = false,
} = {}) {
  const isNonInteractive = yes || !process.stdout.isTTY

  if (lang && !VALID_LANGS.includes(lang)) {
    output.error(`Invalid --lang. Must be one of: ${VALID_LANGS.join(', ')}`)
    process.exit(1)
  }

  if (isNonInteractive) {
    if (!name) {
      output.error('Missing required argument: <name>')
      process.exit(1)
    }
  } else {
    intro('crunes template create')

    if (!name) {
      const result = await text({ message: 'Template name?', validate: v => v ? undefined : 'Required' })
      if (isCancel(result)) { cancel('Cancelled.'); return }
      name = result
    }

    if (!templateRelPath) {
      const defaultPath = global ? `templates/${name}` : `.crunes/templates/${name}`
      const result = await text({ message: 'Folder?', initialValue: defaultPath })
      if (isCancel(result)) { cancel('Cancelled.'); return }
      templateRelPath = result
    }

    if (!templateName) {
      const result = await text({ message: 'Display name? (optional)', placeholder: 'Human-readable label for crunes template list' })
      if (isCancel(result)) { cancel('Cancelled.'); return }
      templateName = result || undefined
    }

    if (!description) {
      const result = await text({ message: 'Description? (optional)', placeholder: 'What kind of rune does this template produce?' })
      if (isCancel(result)) { cancel('Cancelled.'); return }
      description = result || undefined
    }
  }

  templateRelPath = templateRelPath ?? (global ? `templates/${name}` : `.crunes/templates/${name}`)
  const baseRoot = global ? getStorePath() : configRoot
  const script = lang ? SCRIPT_LANGS[lang] : null
  const files = [
    script
      ? [join(baseRoot, templateRelPath, 'src', `index.${script.ext}`), script.body(name)]
      : [join(baseRoot, templateRelPath, 'src', 'index.rune.js'), templateStub(name)],
    [join(baseRoot, templateRelPath, 'test', `${name}.test.js`), runeTestTemplate(name)],
  ]

  for (const [filePath, content] of files) {
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, content)
  }

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
