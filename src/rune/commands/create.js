import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { intro, outro, text, select, cancel } from '@clack/prompts'
import { output } from '../../shared/output.js'
import { getConfigPath, readRawConfig, writeRawConfig } from '../../core/config-writer.js'
import { getStorePath } from '../../store/index.js'

const VALID_FORMATS = ['tree', 'markdown']

export function runeTestTemplate(key) {
  return [
    `import { describe, it } from 'node:test'`,
    `import assert from 'node:assert/strict'`,
    ``,
    `describe('${key} rune', () => {`,
    `  it('placeholder', () => {`,
    `    assert.ok(true)`,
    `  })`,
    `})`,
    ``,
  ].join('\n')
}

async function resolveTarget({ configRoot, global, plugin, project, isNonInteractive }) {
  if (plugin && project) {
    output.error('Cannot specify both --plugin and --project.')
    process.exit(1)
  }
  if (global && plugin) {
    output.error('Cannot specify both --global and --plugin.')
    process.exit(1)
  }
  if (global) return 'global'
  if (plugin) return 'plugin'
  if (project) return 'project'

  const hasPlugin = existsSync(join(configRoot, '.crunes-plugin', 'plugin.json'))
  const hasProject = existsSync(join(configRoot, '.crunes', 'config.json'))

  if (hasPlugin && hasProject) {
    if (isNonInteractive) {
      output.error('Both .crunes-plugin/plugin.json and .crunes/config.json exist. Pass --plugin or --project.')
      process.exit(1)
    }
    const picked = await select({
      message: 'Where should this rune be registered?',
      options: [
        { value: 'plugin', label: 'plugin (.crunes-plugin/plugin.json)', hint: 'exported plugin rune' },
        { value: 'project', label: 'project (.crunes/config.json)', hint: 'dev-time project rune' },
      ],
    })
    if (picked === Symbol.for('clack:cancel')) return null
    return picked
  }

  return hasPlugin ? 'plugin' : 'project'
}

function defaultRunePaths({ target, key, ext, pluginManifest }) {
  if (target === 'plugin') {
    const isEmpty = Object.keys(pluginManifest?.runes ?? {}).length === 0
    return {
      runeRelPath: isEmpty ? `src/index.${ext}` : `runes/${key}/src/index.${ext}`,
      testRelPath: isEmpty ? `test/${key}.test.js` : `runes/${key}/test/${key}.test.js`,
    }
  }
  if (target === 'global') {
    return {
      runeRelPath: `runes/${key}/src/index.${ext}`,
      testRelPath: `runes/${key}/test/${key}.test.js`,
    }
  }
  return {
    runeRelPath: `.crunes/runes/${key}/src/index.${ext}`,
    testRelPath: `.crunes/runes/${key}/test/${key}.test.js`,
  }
}

async function registerRune({ target, configRoot, key, name, description, runeRelPath, isIsolate }) {
  if (target === 'plugin') {
    const pluginJsonPath = join(configRoot, '.crunes-plugin', 'plugin.json')
    const manifest = readRawConfig(pluginJsonPath) ?? { format: '1', runes: {} }
    if (manifest.runes?.[key] != null) {
      output.error(`Rune "${key}" already exists in ${pluginJsonPath}.`)
      process.exit(1)
    }
    const runBlock = isIsolate
      ? { command: runeRelPath, permissions: { allow: [], deny: [] } }
      : { command: runeRelPath }
    manifest.runes = {
      ...(manifest.runes ?? {}),
      [key]: { ...(name && { name }), ...(description && { description }), run: runBlock },
    }
    await writeRawConfig(pluginJsonPath, manifest)
    return
  }

  const configPath = getConfigPath({ configRoot, global: target === 'global' })
  const config = readRawConfig(configPath) ?? { runes: {} }
  if (config.runes?.[key] != null) {
    output.error(`Rune "${key}" already exists in ${configPath}.`)
    process.exit(1)
  }
  config.runes = {
    ...(config.runes ?? {}),
    [key]: { ...(name && { name }), ...(description && { description }), run: runeRelPath },
  }
  await writeRawConfig(configPath, config)
}

/** Script templates for `--lang`: each reads the contract's variables, so it runs as written. */
export const SCRIPT_LANGS = {
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

async function createScriptRune({ key, lang, runeRelPath, name, description, configRoot, target }) {
  const spec = SCRIPT_LANGS[lang]
  if (!spec) {
    output.error(`Invalid --lang. Must be one of: ${VALID_LANGS.join(', ')}`)
    process.exit(1)
  }
  if (!key) {
    output.error('Missing required argument: <key>')
    process.exit(1)
  }
  const pluginManifest = target === 'plugin' ? readRawConfig(join(configRoot, '.crunes-plugin', 'plugin.json')) : null
  const defaults = defaultRunePaths({ target, key, ext: spec.ext, pluginManifest })
  const hasCustomPath = Boolean(runeRelPath)
  runeRelPath = runeRelPath ?? defaults.runeRelPath
  const baseRoot = target === 'global' ? getStorePath() : configRoot
  const runeAbsPath = join(baseRoot, runeRelPath)

  await registerRune({ target, configRoot, key, name, description, runeRelPath, isIsolate: false })
  await mkdir(dirname(runeAbsPath), { recursive: true })
  await writeFile(runeAbsPath, spec.body(key))
  if (!hasCustomPath) {
    const testAbsPath = join(baseRoot, defaults.testRelPath)
    await mkdir(dirname(testAbsPath), { recursive: true })
    await writeFile(testAbsPath, runeTestTemplate(key))
  }
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
  plugin = false,
  project = false,
} = {}) {
  const isNonInteractive = yes || !process.stdout.isTTY
  const target = await resolveTarget({ configRoot, global, plugin, project, isNonInteractive })
  if (!target) { cancel('Cancelled.'); return }

  if (lang) {
    await createScriptRune({ key, lang, runeRelPath, name, description, configRoot, target })
    return
  }

  const pluginManifest = target === 'plugin' ? readRawConfig(join(configRoot, '.crunes-plugin', 'plugin.json')) : null
  const defaults = key ? defaultRunePaths({ target, key, ext: 'rune.js', pluginManifest }) : null

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
      const defaultPath = defaultRunePaths({ target, key, ext: 'rune.js', pluginManifest }).runeRelPath
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

  const finalDefaults = defaults ?? defaultRunePaths({ target, key, ext: 'rune.js', pluginManifest })
  const hasCustomPath = Boolean(runeRelPath)
  runeRelPath = runeRelPath ?? finalDefaults.runeRelPath
  if (!/\.rune\.m?js$/i.test(runeRelPath)) {
    output.error(`${runeRelPath}: a sandboxed rune's file must be named *.rune.js — the name is what runs it in the isolate.`)
    process.exit(1)
  }
  const baseRoot = target === 'global' ? getStorePath() : configRoot
  const runeAbsPath = join(baseRoot, runeRelPath)

  await registerRune({ target, configRoot, key, name, description, runeRelPath, isIsolate: true })
  await mkdir(dirname(runeAbsPath), { recursive: true })
  await writeFile(runeAbsPath, template(key, format))
  if (!hasCustomPath) {
    const testAbsPath = join(baseRoot, finalDefaults.testRelPath)
    await mkdir(dirname(testAbsPath), { recursive: true })
    await writeFile(testAbsPath, runeTestTemplate(key))
  }

  if (!isNonInteractive) {
    outro(`Created ${runeRelPath}\nRun: crunes run ${key}`)
  } else {
    output.success(`Created ${runeRelPath}`)
    output.info(`Run: crunes run ${key}`)
  }
}
