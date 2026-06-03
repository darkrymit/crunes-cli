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

  it('emits one entry per overload for functions with multiple signatures', () => {
    const fixture = {
      id: 0, name: 'utils', kind: 1,
      children: [{
        id: 1, name: 'ws', kind: 4,
        comment: { summary: [{ text: 'WS' }] },
        children: [{
          id: 2, name: 'server', kind: 64,
          signatures: [
            {
              id: 3, name: 'server', kind: 4096,
              comment: { summary: [{ text: 'Standalone server.' }] },
              parameters: [{ id: 4, name: 'port', kind: 32768, type: { type: 'intrinsic', name: 'number' } }],
              type: { type: 'reference', name: 'WsServer' },
            },
            {
              id: 5, name: 'server', kind: 4096,
              comment: { summary: [{ text: 'Piggybacked server.' }] },
              parameters: [{ id: 6, name: 'httpServer', kind: 32768, type: { type: 'reference', name: 'HttpServer' } }],
              type: { type: 'reference', name: 'WsServer' },
            },
          ],
        }],
      }],
    }
    const [ns] = walkUtilsDocs(fixture)
    expect(ns.functions).toHaveLength(2)
    expect(ns.functions[0].name).toBe('server')
    expect(ns.functions[0].description).toBe('Standalone server.')
    expect(ns.functions[0].params[0].name).toBe('port')
    expect(ns.functions[1].name).toBe('server')
    expect(ns.functions[1].description).toBe('Piggybacked server.')
    expect(ns.functions[1].params[0].name).toBe('httpServer')
  })

  it('walks recursively and flattens sub-namespace functions', () => {
    const fixture = {
      id: 0,
      name: 'utils',
      kind: 1,
      children: [
        {
          id: 1,
          name: 'crypto',
          kind: 4,
          comment: { summary: [{ text: 'Crypto utilities' }] },
          children: [
            {
              id: 2,
              name: 'hash',
              kind: 4,
              comment: { summary: [{ text: 'Hash sub-namespace' }] },
              children: [
                {
                  id: 3,
                  name: 'hex',
                  kind: 64,
                  signatures: [
                    {
                      id: 4,
                      name: 'hex',
                      kind: 4096,
                      comment: { summary: [{ text: 'Hex hash.' }] },
                      parameters: [],
                      type: { type: 'intrinsic', name: 'string' },
                    }
                  ]
                }
              ]
            },
            {
              id: 5,
              name: 'uuid',
              kind: 64,
              signatures: [
                {
                  id: 6,
                  name: 'uuid',
                  kind: 4096,
                  comment: { summary: [{ text: 'UUID.' }] },
                  parameters: [],
                  type: { type: 'intrinsic', name: 'string' },
                }
              ]
            }
          ]
        }
      ]
    }

    const [cryptoNs] = walkUtilsDocs(fixture)
    expect(cryptoNs.namespace).toBe('crypto')
    expect(cryptoNs.functions).toHaveLength(2)
    
    const hexFn = cryptoNs.functions.find(f => f.name === 'hash.hex')
    expect(hexFn).toBeDefined()
    expect(hexFn.description).toBe('Hex hash.')
    
    const uuidFn = cryptoNs.functions.find(f => f.name === 'uuid')
    expect(uuidFn).toBeDefined()
    expect(uuidFn.description).toBe('UUID.')
  })
})
