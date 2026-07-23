import { describe, it, expect } from 'vitest'
import { flattenCommands, selectNode, formatCommandPage, formatRuneIndex, formatGlobalIndex } from '../../src/docs/help-render.js'

const SCHEMA = {
  options: [{ flags: '--dry-run', description: 'Print actions without executing' }],
  positionals: [],
  examples: [],
  commands: [
    { name: 'info', description: 'Show current release context', options: [], positionals: [], examples: [], commands: [] },
    {
      name: 'bump',
      description: 'Bump the version',
      options: [{ flags: '-a, --added <text>', description: 'Changelog "Added" entry' }],
      positionals: [{ spec: '<level>', description: 'major | minor | patch' }],
      examples: [],
      commands: [
        { name: 'patch', description: 'Patch bump', options: [], positionals: [], examples: [], commands: [] },
        { name: 'minor', description: 'Minor bump', options: [], positionals: [], examples: [], commands: [] },
      ],
    },
  ],
}

describe('flattenCommands', () => {
  it('emits one row per command at every depth', () => {
    const rows = flattenCommands(SCHEMA.commands)
    expect(rows.map(r => r.path)).toEqual(['info', 'bump', 'bump patch', 'bump minor'])
  })

  it('joins nested command names into full space-separated paths', () => {
    const rows = flattenCommands(SCHEMA.commands)
    expect(rows[2].path).toBe('bump patch')
  })

  it('appends the node own positional specs to the label but not to the path', () => {
    const rows = flattenCommands(SCHEMA.commands)
    const bump = rows.find(r => r.path === 'bump')
    expect(bump.label).toBe('bump <level>')
    expect(bump.path).toBe('bump')
  })

  it('excludes a parent positional spec from a child label', () => {
    const rows = flattenCommands(SCHEMA.commands)
    expect(rows.find(r => r.path === 'bump patch').label).toBe('bump patch')
  })

  it('carries the description through', () => {
    const rows = flattenCommands(SCHEMA.commands)
    expect(rows[0].description).toBe('Show current release context')
  })

  it('returns an empty array for an absent commands list', () => {
    expect(flattenCommands(undefined)).toEqual([])
  })
})

describe('selectNode', () => {
  it('returns the schema itself for an empty segment list', () => {
    const sel = selectNode(SCHEMA, [])
    expect(sel.node).toBe(SCHEMA)
    expect(sel.matchedPath).toBe('')
    expect(sel.failedAt).toBeNull()
  })

  it('resolves a depth-1 command', () => {
    const sel = selectNode(SCHEMA, ['bump'])
    expect(sel.node.name).toBe('bump')
    expect(sel.matchedPath).toBe('bump')
  })

  it('resolves a depth-2 command', () => {
    const sel = selectNode(SCHEMA, ['bump', 'patch'])
    expect(sel.node.name).toBe('patch')
    expect(sel.matchedPath).toBe('bump patch')
  })

  it('lists the children of a resolved node as candidates', () => {
    expect(selectNode(SCHEMA, ['bump']).candidates).toEqual(['patch', 'minor'])
  })

  it('reports failure at depth 0 with the root command names as candidates', () => {
    const sel = selectNode(SCHEMA, ['nope'])
    expect(sel.node).toBeNull()
    expect(sel.failedAt).toBe('nope')
    expect(sel.matchedPath).toBe('')
    expect(sel.candidates).toEqual(['info', 'bump'])
  })

  it('reports failure at depth 2 with the deepest resolved path and its children', () => {
    const sel = selectNode(SCHEMA, ['bump', 'nope'])
    expect(sel.node).toBeNull()
    expect(sel.failedAt).toBe('nope')
    expect(sel.matchedPath).toBe('bump')
    expect(sel.candidates).toEqual(['patch', 'minor'])
  })

  it('returns empty candidates when a resolved leaf has no children', () => {
    expect(selectNode(SCHEMA, ['info']).candidates).toEqual([])
  })
})

describe('formatCommandPage', () => {
  const bump = SCHEMA.commands[1]

  it('renders a usage line with the full command path', () => {
    const out = formatCommandPage(bump, { key: 'release', path: 'bump' })
    expect(out.split('\n')[0]).toBe('Usage: crunes run release bump <level> [options]')
  })

  it('renders <command> instead of positionals when the node has children but no positionals', () => {
    const info = { ...SCHEMA.commands[0], commands: [{ name: 'x', description: 'X', options: [], positionals: [], examples: [], commands: [] }] }
    const out = formatCommandPage(info, { key: 'release', path: 'info' })
    expect(out.split('\n')[0]).toBe('Usage: crunes run release info <command> [options]')
  })

  it('uses the repl verb under the repl lifecycle', () => {
    const out = formatCommandPage(bump, { key: 'release', path: 'bump', lifecycle: 'repl' })
    expect(out.split('\n')[0]).toBe('Usage: crunes repl release bump <level> [options]')
  })

  it('renders the node description indented under the usage line', () => {
    expect(formatCommandPage(bump, { key: 'release', path: 'bump' })).toContain('\n  Bump the version\n')
  })

  it('renders positionals with descriptions', () => {
    const out = formatCommandPage(bump, { key: 'release', path: 'bump' })
    expect(out).toContain('Positionals:')
    expect(out).toContain('  <level>                  major | minor | patch')
  })

  it('renders options with descriptions', () => {
    const out = formatCommandPage(bump, { key: 'release', path: 'bump' })
    expect(out).toContain('Options:')
    expect(out).toContain('-a, --added <text>')
  })

  it('renders a default value in brackets when present', () => {
    const node = { name: 'x', description: '', positionals: [], examples: [], commands: [],
      options: [{ flags: '-n <count>', description: 'How many', def: 10 }] }
    expect(formatCommandPage(node, { key: 'r', path: 'x' })).toContain('[default: 10]')
  })

  it('lists direct children only, one level deep, as full paths', () => {
    const deep = {
      ...bump,
      commands: [{
        name: 'patch', description: 'Patch bump', options: [], positionals: [], examples: [],
        commands: [{ name: 'rc', description: 'RC bump', options: [], positionals: [], examples: [], commands: [] }],
      }],
    }
    const out = formatCommandPage(deep, { key: 'release', path: 'bump' })
    expect(out).toContain('  bump patch')
    expect(out).not.toContain('bump patch rc')
  })

  it('omits every section that has no content', () => {
    const bare = { name: 'x', description: '', options: [], positionals: [], examples: [], commands: [] }
    const out = formatCommandPage(bare, { key: 'r', path: 'x' })
    expect(out).not.toContain('Positionals:')
    expect(out).not.toContain('Options:')
    expect(out).not.toContain('Commands:')
    expect(out).not.toContain('Examples:')
  })

  it('renders examples with their descriptions', () => {
    const node = { name: 'x', description: '', options: [], positionals: [], commands: [],
      examples: [{ usage: 'crunes run r x', description: 'Basic use' }] }
    const out = formatCommandPage(node, { key: 'r', path: 'x' })
    expect(out).toContain('Examples:')
    expect(out).toContain('  crunes run r x')
    expect(out).toContain('    Basic use')
  })

  it('matches the command page snapshot', () => {
    expect(formatCommandPage(bump, { key: 'release', path: 'bump' })).toMatchSnapshot()
  })
})

describe('formatRuneIndex', () => {
  const META = {
    key: 'release',
    name: 'Release',
    description: 'Release automation',
    relativePath: '.crunes/runes/release.js',
    includeBatch: true,
    batch: { allow: ['m', 'kb'], deny: [] },
    repl: { commands: [{ name: 'reload', description: 'Reload the rune' }] },
  }

  it('renders the header with key and description', () => {
    expect(formatRuneIndex(SCHEMA, META)).toContain('Rune: release — Release automation')
  })

  it('falls back to the name when there is no description', () => {
    const out = formatRuneIndex(SCHEMA, { ...META, description: null })
    expect(out).toContain('Rune: release — Release')
  })

  it('renders the project-relative file path when provided', () => {
    expect(formatRuneIndex(SCHEMA, META)).toContain('File (project-relative): .crunes/runes/release.js')
  })

  it('omits the file line for plugin runes with no relative path', () => {
    expect(formatRuneIndex(SCHEMA, { ...META, relativePath: undefined })).not.toContain('File (project-relative)')
  })

  it('lists every command at every depth as a full path', () => {
    const out = formatRuneIndex(SCHEMA, META)
    expect(out).toContain('  info')
    expect(out).toContain('  bump <level>')
    expect(out).toContain('  bump patch')
    expect(out).toContain('  bump minor')
  })

  it('renders rune-level options', () => {
    expect(formatRuneIndex(SCHEMA, META)).toContain('--dry-run')
  })

  it('renders rune-level positionals', () => {
    const schema = { ...SCHEMA, positionals: [{ spec: '<target>', description: 'What to release' }] }
    const out = formatRuneIndex(schema, META)
    expect(out).toContain('Positionals:')
    expect(out).toContain('  <target>                 What to release')
  })

  it('omits rune-level examples from the index to keep it bounded', () => {
    const schema = { ...SCHEMA, examples: [{ usage: 'crunes run release info', description: 'Basic use' }] }
    const out = formatRuneIndex(schema, META)
    expect(out).not.toContain('Examples:')
    expect(out).not.toContain('crunes run release info')
  })

  it('renders REPL slash commands with a leading slash', () => {
    expect(formatRuneIndex(SCHEMA, META)).toContain('  /reload')
  })

  it('omits the REPL section when there are no repl commands', () => {
    expect(formatRuneIndex(SCHEMA, { ...META, repl: null })).not.toContain('REPL commands:')
  })

  it('renders the batch allow list when includeBatch is true', () => {
    expect(formatRuneIndex(SCHEMA, META)).toContain('allow: m, kb')
  })

  it('renders the not-permitted line when batch is null and includeBatch is true', () => {
    const out = formatRuneIndex(SCHEMA, { ...META, batch: null })
    expect(out).toContain('(not permitted — no batch block declared)')
  })

  it('omits the batch section entirely when includeBatch is false', () => {
    const out = formatRuneIndex(SCHEMA, { ...META, includeBatch: false })
    expect(out).not.toContain('Batch:')
  })

  it('renders the drill-down footer', () => {
    expect(formatRuneIndex(SCHEMA, META)).toContain('Drill down: crunes docs rune release <command>')
  })

  it('handles a null schema without throwing', () => {
    const out = formatRuneIndex(null, { key: 'bare', includeBatch: false })
    expect(out).toContain('Usage: crunes run bare [options]')
  })

  it('matches the rune index snapshot', () => {
    expect(formatRuneIndex(SCHEMA, META)).toMatchSnapshot()
  })
})

describe('formatGlobalIndex', () => {
  const ENTRIES = [
    { key: 'release', name: 'Release', description: 'Release automation', source: 'local', schema: SCHEMA },
    { key: 'm', name: 'Map', description: 'Module structure map', source: 'local', schema: null },
    { key: 'ctx:kb', name: 'KB', description: 'Knowledge base entries', source: 'plugin: ctx', schema: { commands: [] } },
    { key: 'broken', name: null, description: null, source: 'local', error: 'boom' },
  ]

  it('renders a header line per rune with description and source', () => {
    const out = formatGlobalIndex(ENTRIES)
    expect(out).toContain('release — Release automation')
    expect(out).toContain('local')
  })

  it('renders each rune command tree as full paths', () => {
    const out = formatGlobalIndex(ENTRIES)
    expect(out).toContain('  bump patch')
  })

  it('renders a rune with no schema as a bare header line', () => {
    const lines = formatGlobalIndex(ENTRIES).split('\n')
    const i = lines.findIndex(l => l.startsWith('m — '))
    expect(lines[i + 1]).toBe('')
  })

  it('renders a rune with an empty command list as a bare header line', () => {
    const lines = formatGlobalIndex(ENTRIES).split('\n')
    const i = lines.findIndex(l => l.startsWith('ctx:kb — '))
    expect(lines[i + 1]).toBe('')
  })

  it('renders a warn line for a rune whose schema failed to build', () => {
    expect(formatGlobalIndex(ENTRIES)).toContain('⚠ broken — could not build args schema: boom')
  })

  it('renders the drill-down footer', () => {
    expect(formatGlobalIndex(ENTRIES)).toContain('Drill down: crunes docs rune <key> [command path...]')
  })

  it('renders an empty-state line when there are no runes', () => {
    expect(formatGlobalIndex([])).toContain('No runes configured.')
  })

  it('does not list REPL commands or batch blocks', () => {
    const out = formatGlobalIndex(ENTRIES)
    expect(out).not.toContain('REPL commands:')
    expect(out).not.toContain('Batch:')
  })

  it('matches the global index snapshot', () => {
    expect(formatGlobalIndex(ENTRIES)).toMatchSnapshot()
  })
})
