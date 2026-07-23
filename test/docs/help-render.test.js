import { describe, it, expect } from 'vitest'
import { flattenCommands, selectNode } from '../../src/docs/help-render.js'

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
