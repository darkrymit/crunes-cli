import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createModuleResolver } from '../../../src/rune/isolation/resolver.js'

async function makeTmp() {
  const tmp = await mkdtemp(join(tmpdir(), 'crunes-resolver-test-'))
  await mkdir(join(tmp, 'src'), { recursive: true })
  await writeFile(join(tmp, 'src/utils.js'), 'export const x = 1')
  return tmp
}

function makeMockIsolate() {
  return {
    compileModule: vi.fn().mockResolvedValue({ evaluate: vi.fn() })
  }
}

describe('createModuleResolver — @project/ imports', () => {
  let tmp, isolate

  beforeEach(async () => {
    tmp = await makeTmp()
    isolate = makeMockIsolate()
  })
  afterEach(async () => { await rm(tmp, { recursive: true, force: true }) })

  it('compiles @project/ file when fs.read permission is granted', async () => {
    const { resolve } = createModuleResolver(isolate, tmp, tmp, {}, ['fs.read:./src/**'], [], tmp)
    await resolve('@project/src/utils.js', null)
    expect(isolate.compileModule).toHaveBeenCalledWith(
      'export const x = 1',
      expect.objectContaining({ filename: join(tmp, 'src/utils.js') })
    )
  })

  it('throws PermissionError when fs.read not granted for @project/ path', async () => {
    const { resolve } = createModuleResolver(isolate, tmp, tmp, {}, [], [], tmp)
    await expect(resolve('@project/src/utils.js', null))
      .rejects.toThrow('PermissionError')
  })

  it('throws PermissionError when @project/ path escapes project root', async () => {
    const { resolve } = createModuleResolver(isolate, tmp, tmp, {}, ['fs.read:**'], [], tmp)
    await expect(resolve('@project/../outside.js', null))
      .rejects.toThrow('PermissionError')
  })

  it('throws when projectDir is not provided', async () => {
    const { resolve } = createModuleResolver(isolate, tmp, tmp, {}, ['fs.read:./src/**'], [])
    await expect(resolve('@project/src/utils.js', null))
      .rejects.toThrow()
  })

  it('caches compiled @project/ module on second call', async () => {
    const { resolve } = createModuleResolver(isolate, tmp, tmp, {}, ['fs.read:./src/**'], [], tmp)
    await resolve('@project/src/utils.js', null)
    await resolve('@project/src/utils.js', null)
    expect(isolate.compileModule).toHaveBeenCalledTimes(1)
  })
})

describe('createModuleResolver — @plugin/ imports', () => {
  let pluginRoot, projectDir, isolate

  beforeEach(async () => {
    pluginRoot  = await mkdtemp(join(tmpdir(), 'crunes-resolver-plugin-'))
    projectDir  = await mkdtemp(join(tmpdir(), 'crunes-resolver-project-'))
    await mkdir(join(pluginRoot, 'lib'), { recursive: true })
    await writeFile(join(pluginRoot, 'lib/shared.js'), 'export const msg = "from plugin"')
    isolate = makeMockIsolate()
  })
  afterEach(async () => {
    await rm(pluginRoot, { recursive: true, force: true })
    await rm(projectDir, { recursive: true, force: true })
  })

  it('resolves @plugin/<path> to pluginRootDir/<path>', async () => {
    const { resolve } = createModuleResolver(
      isolate, pluginRoot, pluginRoot, {}, [], [], projectDir, pluginRoot
    )
    await resolve('@plugin/lib/shared.js', null)
    expect(isolate.compileModule).toHaveBeenCalledWith(
      'export const msg = "from plugin"',
      expect.objectContaining({ filename: join(pluginRoot, 'lib/shared.js') })
    )
  })

  it('throws PermissionError when pluginRootDir is null (project rune)', async () => {
    const { resolve } = createModuleResolver(
      isolate, projectDir, projectDir, {}, [], [], projectDir, null
    )
    await expect(resolve('@plugin/lib/shared.js', null))
      .rejects.toThrow('PermissionError')
  })

  it('throws PermissionError when @plugin/ path escapes plugin root', async () => {
    const { resolve } = createModuleResolver(
      isolate, pluginRoot, pluginRoot, {}, [], [], projectDir, pluginRoot
    )
    await expect(resolve('@plugin/../outside.js', null))
      .rejects.toThrow('PermissionError')
  })

  it('caches compiled @plugin/ module on second call', async () => {
    const { resolve } = createModuleResolver(
      isolate, pluginRoot, pluginRoot, {}, [], [], projectDir, pluginRoot
    )
    await resolve('@plugin/lib/shared.js', null)
    await resolve('@plugin/lib/shared.js', null)
    expect(isolate.compileModule).toHaveBeenCalledTimes(1)
  })
})

describe('createModuleResolver — relative imports', () => {
  let pluginRoot, projectDir, isolate

  beforeEach(async () => {
    pluginRoot = await mkdtemp(join(tmpdir(), 'crunes-resolver-plugin-'))
    projectDir = await mkdtemp(join(tmpdir(), 'crunes-resolver-project-'))
    await mkdir(join(pluginRoot, 'lib'), { recursive: true })
    await writeFile(join(pluginRoot, 'lib/helper.js'), 'export const h = 1')
    await mkdir(join(projectDir, 'src'), { recursive: true })
    await writeFile(join(projectDir, 'src/utils.js'), 'export const u = 1')
    isolate = makeMockIsolate()
  })
  afterEach(async () => {
    await rm(pluginRoot, { recursive: true, force: true })
    await rm(projectDir, { recursive: true, force: true })
  })

  it('plugin rune: resolves relative import within pluginRootDir', async () => {
    const { resolve, register } = createModuleResolver(
      isolate, pluginRoot, pluginRoot, {}, [], [], projectDir, pluginRoot
    )
    const runeFile = join(pluginRoot, 'rune.js')
    await writeFile(runeFile, '')
    const runeMod = await isolate.compileModule('', { filename: runeFile })
    register(runeMod, runeFile)
    await resolve('./lib/helper.js', runeMod)
    expect(isolate.compileModule).toHaveBeenCalledWith(
      'export const h = 1',
      expect.objectContaining({ filename: join(pluginRoot, 'lib/helper.js') })
    )
  })

  it('plugin rune: throws PermissionError when relative import escapes pluginRootDir', async () => {
    const { resolve, register } = createModuleResolver(
      isolate, pluginRoot, pluginRoot, {}, [], [], projectDir, pluginRoot
    )
    const runeFile = join(pluginRoot, 'rune.js')
    await writeFile(runeFile, '')
    const runeMod = await isolate.compileModule('', { filename: runeFile })
    register(runeMod, runeFile)
    await expect(resolve('../../outside.js', runeMod))
      .rejects.toThrow('PermissionError')
  })

  it('plugin rune: throws PermissionError for absolute path outside pluginRootDir', async () => {
    const { resolve } = createModuleResolver(
      isolate, pluginRoot, pluginRoot, {}, [], [], projectDir, pluginRoot
    )
    await expect(resolve('/etc/passwd', null))
      .rejects.toThrow('PermissionError')
  })

  it('project rune: resolves relative import within projectDir with fs.read permission', async () => {
    const { resolve, register } = createModuleResolver(
      isolate, projectDir, projectDir, {}, ['fs.read:./src/**'], [], projectDir, null
    )
    const runeFile = join(projectDir, 'rune.js')
    await writeFile(runeFile, '')
    const runeMod = await isolate.compileModule('', { filename: runeFile })
    register(runeMod, runeFile)
    await resolve('./src/utils.js', runeMod)
    expect(isolate.compileModule).toHaveBeenCalledWith(
      'export const u = 1',
      expect.objectContaining({ filename: join(projectDir, 'src/utils.js') })
    )
  })

  it('project rune: throws PermissionError when fs.read not granted', async () => {
    const { resolve, register } = createModuleResolver(
      isolate, projectDir, projectDir, {}, [], [], projectDir, null
    )
    const runeFile = join(projectDir, 'rune.js')
    await writeFile(runeFile, '')
    const runeMod = await isolate.compileModule('', { filename: runeFile })
    register(runeMod, runeFile)
    await expect(resolve('./src/utils.js', runeMod))
      .rejects.toThrow('PermissionError')
  })

  it('project rune: throws PermissionError when relative import escapes projectDir', async () => {
    const { resolve, register } = createModuleResolver(
      isolate, projectDir, projectDir, {}, ['fs.read:**'], [], projectDir, null
    )
    const runeFile = join(projectDir, 'rune.js')
    await writeFile(runeFile, '')
    const runeMod = await isolate.compileModule('', { filename: runeFile })
    register(runeMod, runeFile)
    await expect(resolve('../../outside.js', runeMod))
      .rejects.toThrow('PermissionError')
  })

  it('throws PermissionError when both pluginRootDir and projectDir are null', async () => {
    const { resolve } = createModuleResolver(
      isolate, pluginRoot, pluginRoot, {}, [], [], null, null
    )
    await expect(resolve('./anything.js', null))
      .rejects.toThrow('PermissionError')
  })
})

describe('createModuleResolver — virtualModules', () => {
  let tmp, isolate

  beforeEach(async () => {
    tmp = await makeTmp()
    isolate = makeMockIsolate()
  })
  afterEach(async () => { await rm(tmp, { recursive: true, force: true }) })

  it('returns module from map when specifier matches', async () => {
    const mockMod = { evaluate: vi.fn() }
    const { resolve } = createModuleResolver(isolate, tmp, tmp, {}, [], [], null, null, new Map([['@utils', mockMod]]))
    const result = await resolve('@utils', null)
    expect(result).toBe(mockMod)
  })

  it('falls through to normal resolution when specifier not in map', async () => {
    const { resolve } = createModuleResolver(isolate, tmp, tmp, {}, [], [], null, null, new Map([['@utils', {}]]))
    await expect(resolve('@something-else', null)).rejects.toThrow('PermissionError')
  })

  it('works with no virtualModules argument (default empty map)', async () => {
    const { resolve } = createModuleResolver(isolate, tmp, tmp, {}, [], [], null, null)
    await expect(resolve('@utils', null)).rejects.toThrow('PermissionError')
  })
})
