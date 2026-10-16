import { mkdir, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { intro, outro, text, select, cancel } from '@clack/prompts'
import { output } from '../../shared/output.js'
import { getConfigPath, readRawConfig, writeRawConfig } from '../../core/config-writer.js'
import { getStorePath } from '../../store/index.js'

const VALID_FORMATS = ['tree', 'markdown']

/** Script templates for `--lang`: each reads the contract's variables, so it runs as written. */
const SCRIPT_LANGS = {
  python: {
    ext: 'py',
    body: key => [
      `import json`,
      `import os`,
      `import sys`,
      ``,
      `# A script rune: crunes runs this with the project's Python and passes`,
      `#   sys.argv[1:]      the caller's arguments, unchanged`,
      `#   CRUNES_ARGS       the parsed arguments as JSON, when the rune has an args schema`,
      `#   CRUNES_VARS       the rune's configured vars as JSON`,
      `# Whatever it prints is the rune's output.`,
      ``,
      `args = json.loads(os.environ.get("CRUNES_ARGS", "null"))`,
      `rune_vars = json.loads(os.environ.get("CRUNES_VARS", "{}"))`,
      ``,
      `print("${key}:", sys.argv[1:])`,
      ``,
    ].join('\n'),
  },
  bash: {
    ext: 'sh',
    body: key => [
      `# A script rune: crunes runs this with bash and passes`,
      `#   "$@"              the caller's arguments, unchanged`,
      `#   CRUNES_ARGS       the parsed arguments as JSON, when the rune has an args schema`,
      `#   CRUNES_VARS       the rune's configured vars as JSON`,
      `# Whatever it prints is the rune's output; its exit code is crunes's.`,
      ``,
      `echo "${key}: $*"`,
      ``,
    ].join('\n'),
  },
  node: {
    ext: 'js',
    body: key => [
      `// A script rune: crunes runs this with Node, outside the sandbox, and passes`,
      `//   process.argv.slice(2)  the caller's arguments, unchanged`,
      `//   CRUNES_ARGS            the parsed arguments as JSON, when the rune has an args schema`,
      `//   CRUNES_VARS            the rune's configured vars as JSON`,
      `// Whatever it prints is the rune's output. To run in the sandbox instead, use a *.rune.js file.`,
      ``,
      `const args = JSON.parse(process.env.CRUNES_ARGS ?? 'null')`,
      `const vars = JSON.parse(process.env.CRUNES_VARS ?? '{}')`,
      ``,
      `console.log('${key}:', process.argv.slice(2))`,
      ``,
    ].join('\n'),
  },
}

export const VALID_LANGS = Object.keys(SCRIPT_LANGS)

async function createScriptRune({ key, lang, runeRelPath, name, description, configRoot, global }) {
  const spec = SCRIPT_LANGS[lang]
  if (!spec) {
    output.error(`Invalid --lang. Must be one of: ${VALID_LANGS.join(', ')}`)
    process.exit(1)
  }
  if (!key) {
    output.error('Missing required argument: <key>')
    process.exit(1)
  }
  runeRelPath = runeRelPath ?? (global ? `runes/${key}.${spec.ext}` : `.crunes/runes/${key}.${spec.ext}`)
  const runeAbsPath = join(global ? getStorePath() : configRoot, runeRelPath)

  const configPath = getConfigPath({ configRoot, global })
  const config = readRawConfig(configPath) ?? { runes: {} }
  if (config.runes?.[key] != null) {
    output.error(`Rune "${key}" already exists in ${configPath}.`)
    process.exit(1)
  }

  await mkdir(dirname(runeAbsPath), { recursive: true })
  await writeFile(runeAbsPath, spec.body(key))
  config.runes = {
    ...(config.runes ?? {}),
    [key]: { ...(name && { name }), ...(description && { description }), run: runeRelPath },
  }
  await writeRawConfig(configPath, config)
  output.success(`Created ${runeRelPath} (${lang}, native)`)
  output.info(`Run: crunes run ${key}`)
}

export function template(key, format) {
  const imports = format === 'tree'
    ? `import { md, section, tree } from '@utils'`
    : `import { md, section } from '@utils'`

  const header = [
    `// permissions:`,
    `//   run:`,
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
    `export async function run(args) {`,
    `  // args._         — data positionals (command tokens stripped)`,
    `  // args.$rest     — unmapped positional arguments`,
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
  lang,
  path: runeRelPath,
  name,
  description,
  yes = false,
  projectRoot = process.cwd(),
  configRoot = projectRoot,
  global = false,
} = {}) {
  if (lang) {
    await createScriptRune({ key, lang, runeRelPath, name, description, configRoot, global })
    return
  }
  const isNonInteractive = yes || !process.stdout.isTTY

  if (isNonInteractive) {
    if (!key) {
      output.error('Missing required argument: <key>')
      process.exit(1)
    }
    if (format && !VALID_FORMATS.includes(format)) {
      output.error(`Invalid --format. Must be one of: ${VALID_FORMATS.join(', ')}`)
      process.exit(1)
    }
    if (!format) {
      format = 'markdown'
      output.info('--format not specified, defaulting to "markdown"')
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
      const defaultPath = global ? `runes/${key}.rune.js` : `.crunes/runes/${key}.rune.js`
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

  runeRelPath = runeRelPath ?? (global ? `runes/${key}.rune.js` : `.crunes/runes/${key}.rune.js`)
  if (!/\.rune\.m?js$/i.test(runeRelPath)) {
    output.error(`${runeRelPath}: a sandboxed rune's file must be named *.rune.js — the name is what runs it in the isolate.`)
    process.exit(1)
  }
  const baseRoot = global ? getStorePath() : configRoot
  const runeAbsPath = join(baseRoot, runeRelPath)

  await mkdir(dirname(runeAbsPath), { recursive: true })
  await writeFile(runeAbsPath, template(key, format))

  const configPath = getConfigPath({ configRoot, global })
  const config = readRawConfig(configPath) ?? { runes: {} }
  const entry = {
    ...(name && { name }),
    ...(description && { description }),
    run: runeRelPath,
  }
  config.runes = { ...(config.runes ?? {}), [key]: entry }
  await writeRawConfig(configPath, config)

  if (!isNonInteractive) {
    outro(`Created ${runeRelPath}\nRun: crunes run ${key}`)
  } else {
    output.success(`Created ${runeRelPath}`)
    output.info(`Run: crunes run ${key}`)
  }
}
