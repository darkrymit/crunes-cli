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
    const resolver = createModuleResolver(isolate, tmp, tmp, {}, ['fs.read:./src/**'], [], tmp)
    await resolver('@project/src/utils.js', null)
    expect(isolate.compileModule).toHaveBeenCalledWith(
      'export const x = 1',
      expect.objectContaining({ filename: join(tmp, 'src/utils.js') })
    )
  })

  it('throws PermissionError when fs.read not granted for @project/ path', async () => {
    const resolver = createModuleResolver(isolate, tmp, tmp, {}, [], [], tmp)
    await expect(resolver('@project/src/utils.js', null))
      .rejects.toThrow('PermissionError')
  })

  it('throws PermissionError when @project/ path escapes project root', async () => {
    const resolver = createModuleResolver(isolate, tmp, tmp, {}, ['fs.read:**'], [], tmp)
    await expect(resolver('@project/../outside.js', null))
      .rejects.toThrow('PermissionError')
  })

  it('throws when projectDir is not provided', async () => {
    const resolver = createModuleResolver(isolate, tmp, tmp, {}, ['fs.read:./src/**'], [])
    await expect(resolver('@project/src/utils.js', null))
      .rejects.toThrow()
  })

  it('caches compiled @project/ module on second call', async () => {
    const resolver = createModuleResolver(isolate, tmp, tmp, {}, ['fs.read:./src/**'], [], tmp)
    await resolver('@project/src/utils.js', null)
    await resolver('@project/src/utils.js', null)
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
    const resolver = createModuleResolver(
      isolate, pluginRoot, pluginRoot, {}, [], [], projectDir, pluginRoot
    )
    await resolver('@plugin/lib/shared.js', null)
    expect(isolate.compileModule).toHaveBeenCalledWith(
      'export const msg = "from plugin"',
      expect.objectContaining({ filename: join(pluginRoot, 'lib/shared.js') })
    )
  })

  it('throws PermissionError when pluginRootDir is null (project rune)', async () => {
    const resolver = createModuleResolver(
      isolate, projectDir, projectDir, {}, [], [], projectDir, null
    )
    await expect(resolver('@plugin/lib/shared.js', null))
      .rejects.toThrow('PermissionError')
  })

  it('throws PermissionError when @plugin/ path escapes plugin root', async () => {
    const resolver = createModuleResolver(
      isolate, pluginRoot, pluginRoot, {}, [], [], projectDir, pluginRoot
    )
    await expect(resolver('@plugin/../outside.js', null))
      .rejects.toThrow('PermissionError')
  })

  it('caches compiled @plugin/ module on second call', async () => {
    const resolver = createModuleResolver(
      isolate, pluginRoot, pluginRoot, {}, [], [], projectDir, pluginRoot
    )
    await resolver('@plugin/lib/shared.js', null)
    await resolver('@plugin/lib/shared.js', null)
    expect(isolate.compileModule).toHaveBeenCalledTimes(1)
  })
})
