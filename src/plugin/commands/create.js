import { mkdir, writeFile, readdir } from 'node:fs/promises'
import { join, resolve, dirname } from 'node:path'
import { spawnSync } from 'node:child_process'
import { intro, outro, text, confirm, cancel } from '@clack/prompts'
import { output } from '../../shared/output.js'

export function pluginJson({ name, description, author, license }) {
  return JSON.stringify({
    format: '1',
    name,
    version: '1.0.0',
    description,
    author: { name: author },
    license,
    keywords: [],
    runes: {
      example: {
        name: 'Example Rune',
        description: 'Replace with your rune description',
        permissions: {
          use: {
            allow: [],
            deny: [],
          },
        },
      },
    },
    templates: {
      'example-template': {
        name: 'Example Template',
        description: 'Replace with your template description',
      },
    },
  }, null, 2) + '\n'
}

export function marketplaceJson({ name, description, author }) {
  return JSON.stringify({
    format: '1',
    name,
    description,
    owner: { name: author },
    plugins: [{
      name,
      description,
      version: '1.0.0',
      author: { name: author },
      source: './',
      category: 'runes',
    }],
  }, null, 2) + '\n'
}

export function exampleRune() {
  return `// Ready-to-run rune — runs directly from the plugin install location.
// Users activate it by adding your plugin to their project config.
//
// permissions (plugin.json):
//   use:
//     allow: []  — add patterns like fs.read:./** if you use utils.fs
//     deny:  []

import { md, section } from '@utils'

// export async function args(b) {
//   return b
//     .option('-v, --verbose', 'Verbose output', false)
//     .build()
// }

export async function use(args) {
  // args._         — positional arguments (string[])
  // args.verbose   — named flag (if args export is defined above)
  // utils.fs.cwd() — absolute path to the user's project root

  return section.create('example', {
    type: 'markdown',
    content: md.h3('Example') + '\\n' + md.ul(['Replace with real output']),
  });
}
`
}

export function exampleTemplate() {
  return `// Template rune — copied into the user's project by \`crunes template use\`.
// Edit this file to define what a new rune looks like when scaffolded from your plugin.
//
// permissions (plugin.json):
//   use:
//     allow: []  — add patterns like fs.read:./** if you use utils.fs
//     deny:  []

import { md, section } from '@utils'

// export async function args(b) {
//   return b
//     .option('-v, --verbose', 'Verbose output', false)
//     .build()
// }

export async function use(args) {
  // args._         — positional arguments (string[])
  // args.verbose   — named flag (if args export is defined above)
  // utils.fs.cwd() — absolute path to the user's project root

  return section.create('example', {
    type: 'markdown',
    content: md.h3('Example') + '\\n' + md.ul(['Replace with real output']),
  });
}
`
}

export function readmeMd({ name, description }) {
  return `# ${name}\n\n${description}\n\n## Installation\n\nAdd this plugin via the crunes marketplace.\n`
}

export function changelogMd() {
  return `# Changelog\n\n## 1.0.0\n\n- Initial release\n`
}

function getGitAuthor() {
  const result = spawnSync('git', ['config', 'user.name'], { encoding: 'utf8' })
  return result.status === 0 ? result.stdout.trim() : ''
}

export async function handler({
  name,
  description,
  author,
  license,
  out,
  yes = false,
  projectRoot = process.cwd(),
} = {}) {
  const isNonInteractive = yes || !process.stdout.isTTY

  if (isNonInteractive) {
    if (!name) { output.error('Missing required argument: <name>'); process.exit(1) }
    if (!description) { output.error('Missing required option: --description'); process.exit(1) }
    author = author ?? getGitAuthor()
    license = license ?? 'MIT'
  } else {
    intro('crunes plugin create')

    if (!name) {
      const r = await text({ message: 'Plugin name?', validate: v => v ? undefined : 'Required' })
      if (r === Symbol.for('clack:cancel')) { cancel('Cancelled.'); return }
      name = r
    }

    if (!description) {
      const r = await text({ message: 'Description?', validate: v => v ? undefined : 'Required' })
      if (r === Symbol.for('clack:cancel')) { cancel('Cancelled.'); return }
      description = r
    }

    if (author === undefined) {
      const r = await text({ message: 'Author?', initialValue: getGitAuthor() })
      if (r === Symbol.for('clack:cancel')) { cancel('Cancelled.'); return }
      author = r
    }

    if (license === undefined) {
      const r = await text({ message: 'License?', initialValue: 'MIT' })
      if (r === Symbol.for('clack:cancel')) { cancel('Cancelled.'); return }
      license = r
    }
  }

  const outDir = resolve(projectRoot, out ?? name)

  let entries = []
  try { entries = await readdir(outDir) } catch {}
  if (entries.length > 0) {
    if (isNonInteractive) {
      output.error(`Output directory "${outDir}" already exists and is not empty. Provide --out pointing to an empty location.`)
      process.exit(1)
    }
    const ok = await confirm({ message: `"${outDir}" already exists and is not empty. Overwrite?` })
    if (!ok || ok === Symbol.for('clack:cancel')) { cancel('Cancelled.'); return }
  }

  const opts = { name, description, author, license }

  const files = [
    [join(outDir, '.crunes-plugin', 'plugin.json'), pluginJson(opts)],
    [join(outDir, '.crunes-plugin', 'marketplace.json'), marketplaceJson(opts)],
    [join(outDir, 'runes', 'example.js'), exampleRune()],
    [join(outDir, 'templates', 'example-template.js'), exampleTemplate()],
    [join(outDir, 'README.md'), readmeMd(opts)],
    [join(outDir, 'CHANGELOG.md'), changelogMd()],
  ]

  for (const [filePath, content] of files) {
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, content)
  }

  const successMsg = `Created ${outDir}`
  const hintMsg = `Run the following to test locally:\n1. crunes marketplace add ./${name}\n2. crunes plugin install ${name}@${name}`
  if (isNonInteractive) {
    output.success(successMsg)
    output.info(`Run: crunes marketplace add ./${name} && crunes plugin install ${name}@${name}`)
  } else {
    outro(`${successMsg}\n${hintMsg}`)
  }
}
