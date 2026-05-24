import { describe, it, expect } from 'vitest'
import { walkUtilsDocs } from '../../src/docs/utils-walker.js'

// Minimal TypeDoc JSON fixture representing the ws namespace
const FIXTURE = {
  id: 0,
  name: 'utils',
  kind: 1,
  children: [
    {
      id: 1,
      name: 'ws',
      kind: 4,
      comment: { summary: [{ text: 'WebSocket client' }] },
      children: [
        {
          id: 2,
          name: 'client',
          kind: 64,
          signatures: [
            {
              id: 3,
              name: 'client',
              kind: 4096,
              comment: {
                summary: [{ text: 'Creates a WS handle.' }],
                blockTags: [
                  { tag: '@param', name: 'url', content: [{ text: 'WebSocket URL' }] },
                ],
              },
              parameters: [
                {
                  id: 4,
                  name: 'url',
                  kind: 32768,
                  type: { type: 'intrinsic', name: 'string' },
                },
                {
                  id: 5,
                  name: 'opts',
                  kind: 32768,
                  flags: { isOptional: true },
                  type: { type: 'intrinsic', name: 'object' },
                },
              ],
              type: { type: 'reference', name: 'WsHandle' },
            },
          ],
        },
        {
          id: 6,
          name: 'WsHandle',
          kind: 256,
          comment: { summary: [{ text: 'WS connection handle' }] },
          children: [
            {
              id: 7,
              name: 'open',
              kind: 2048,
              signatures: [
                {
                  id: 8,
                  name: 'open',
                  kind: 4096,
                  comment: { summary: [{ text: 'Connect and wait.' }] },
                  parameters: [],
                  type: {
                    type: 'reference',
                    name: 'Promise',
                    typeArguments: [{ type: 'intrinsic', name: 'void' }],
                  },
                },
              ],
            },
          ],
        },
      ],
    },
  ],
}

describe('walkUtilsDocs', () => {
  it('returns one entry per namespace', () => {
    const result = walkUtilsDocs(FIXTURE)
    expect(result).toHaveLength(1)
    expect(result[0].namespace).toBe('ws')
  })

  it('extracts namespace description', () => {
    const [ns] = walkUtilsDocs(FIXTURE)
    expect(ns.description).toBe('WebSocket client')
  })

  it('extracts function name and description', () => {
    const [ns] = walkUtilsDocs(FIXTURE)
    expect(ns.functions[0].name).toBe('client')
    expect(ns.functions[0].description).toBe('Creates a WS handle.')
  })

  it('extracts param names, types, optional flag', () => {
    const [ns] = walkUtilsDocs(FIXTURE)
    const params = ns.functions[0].params
    expect(params[0].name).toBe('url')
    expect(params[0].type).toBe('string')
    expect(params[0].optional).toBeFalsy()
    expect(params[1].name).toBe('opts')
    expect(params[1].optional).toBe(true)
  })

  it('extracts return type name', () => {
    const [ns] = walkUtilsDocs(FIXTURE)
    expect(ns.functions[0].returns).toBe('WsHandle')
  })

  it('extracts interface as type with methods', () => {
    const [ns] = walkUtilsDocs(FIXTURE)
    expect(ns.types.WsHandle).toBeDefined()
    expect(ns.types.WsHandle.methods[0].name).toBe('open')
    expect(ns.types.WsHandle.methods[0].description).toBe('Connect and wait.')
    expect(ns.types.WsHandle.methods[0].returns).toBe('Promise<void>')
  })
})
