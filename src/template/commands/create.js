import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { intro, outro, text, cancel } from '@clack/prompts'
import { output } from '../../shared/output.js'

function templateStub(name) {
  return [
    `// permissions:`,
    `//   use:`,
    `//     allow: []  — add patterns like fs.read:./** if you use utils.fs`,
    `//     deny:  []`,
    ``,
    `export async function use(dir, args, utils) {`,
    `  // dir   — absolute path to the user's project root`,
    `  // args  — string[] passed via $key=arg1,arg2`,
    `  // utils — { md, tree, section, fs, json, shell, fetch, env, vars, rune }`,
    `  //`,
    `  // utils.section.selected()         → string[] | null — requested section patterns`,
    `  // utils.section.match(name)        → bool            — true if section is requested`,
    `  // utils.section.create(name, data) → Section         — build a section object`,
    ``,
    `  const content = [`,
    `    utils.md.h3('${name}'),`,
    `    utils.md.ul(['Replace with real output']),`,
    `  ].join('\\n');`,
    `  return utils.section.create('example-md', { type: 'markdown', content });`,
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
      const defaultPath = `.crunes/templates/${name}.js`
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

  templateRelPath = templateRelPath ?? `.crunes/templates/${name}.js`
  const templateAbsPath = join(projectRoot, templateRelPath)

  mkdirSync(dirname(templateAbsPath), { recursive: true })
  writeFileSync(templateAbsPath, templateStub(name))

  // Register in config under templates key
  const configPath = join(projectRoot, '.crunes', 'config.json')
  let config = { runes: {} }
  if (existsSync(configPath)) {
    try { config = JSON.parse(readFileSync(configPath, 'utf8')) } catch {}
  }

  const entry = {
    path: templateRelPath,
    ...(templateName && { name: templateName }),
    ...(description && { description })
  }
  config.templates = { ...(config.templates ?? {}), [name]: entry }
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n')

  if (!isNonInteractive) {
    outro(`Created ${templateRelPath}\nUse it with: crunes template use ${name}`)
  } else {
    output.success(`Created ${templateRelPath}`)
    output.info(`Use it with: crunes template use ${name}`)
  }
}
