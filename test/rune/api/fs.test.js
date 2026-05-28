import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createFsUtils } from '../../../src/rune/api/fs.js'
import { makePermissionChecker, PermissionError } from '../../../src/rune/permissions/permissions.js'

async function makeTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'crunes-test-'))
}

async function writeFile(dir, rel, content = 'content') {
  const abs = path.join(dir, rel)
  await fs.mkdir(path.dirname(abs), { recursive: true })
  await fs.writeFile(abs, content, 'utf8')
}

function checkerFor(allow, deny = []) {
  return makePermissionChecker({ allow, deny })
}

describe('createFsUtils — canonical permission tokens', () => {
  let dir

  beforeEach(async () => {
    dir = await makeTempDir()
    await writeFile(dir, 'package.json', '{}')
    await writeFile(dir, 'src/utils/foo.ts', 'export {}')
  })

  it('relative path without ./ normalizes to ./ prefix', async () => {
    const spy = vi.fn()
    await createFsUtils(dir, spy).read('package.json').catch(() => {})
    expect(spy).toHaveBeenCalledWith('fs.read', './package.json')
  })

  it('./ prefix is kept as-is', async () => {
    const spy = vi.fn()
    await createFsUtils(dir, spy).read('./package.json').catch(() => {})
    expect(spy).toHaveBeenCalledWith('fs.read', './package.json')
  })

  it('resolves ../ segments in relative paths', async () => {
    const spy = vi.fn()
    await createFsUtils(dir, spy).read('./src/../package.json').catch(() => {})
    expect(spy).toHaveBeenCalledWith('fs.read', './package.json')
  })

  it('absolute path token has normalized separators', async () => {
    const spy = vi.fn()
    const abs = path.join(dir, 'package.json')
    await createFsUtils(dir, spy).read(abs).catch(() => {})
    expect(spy).toHaveBeenCalledWith('fs.read', abs.replace(/\\/g, '/'))
  })

  it('~ prefix is kept as canonical token', async () => {
    const spy = vi.fn()
    await createFsUtils(dir, spy).read('~/.npmrc').catch(() => {})
    expect(spy).toHaveBeenCalledWith('fs.read', '~/.npmrc')
  })

  it('traversal path keeps ../ canonical form', async () => {
    const spy = vi.fn()
    await createFsUtils(dir, spy).read('../outside/file.txt').catch(() => {})
    expect(spy).toHaveBeenCalledWith('fs.read', '../outside/file.txt')
  })

  it('@plugin/ path produces @plugin/ token', async () => {
    const spy = vi.fn()
    const pluginDir = await makeTempDir()
    await writeFile(pluginDir, 'assets/schema.json', '{}')
    await createFsUtils(dir, spy, pluginDir).read('@plugin/assets/schema.json')
    expect(spy).toHaveBeenCalledWith('fs.read', '@plugin/assets/schema.json')
  })

  it('exists() uses same canonical token', async () => {
    const spy = vi.fn()
    await createFsUtils(dir, spy).exists('./package.json').catch(() => {})
    expect(spy).toHaveBeenCalledWith('fs.read', './package.json')
  })
})

describe('createFsUtils — file reading', () => {
  let dir

  beforeEach(async () => {
    dir = await makeTempDir()
    await writeFile(dir, 'hello.txt', 'hello world')
  })

  it('reads a project-relative file', async () => {
    const fsUtils = createFsUtils(dir, null)
    expect(await fsUtils.read('./hello.txt')).toBe('hello world')
  })

  it('reads an absolute path', async () => {
    const abs = path.join(dir, 'hello.txt')
    const fsUtils = createFsUtils(dir, null)
    expect(await fsUtils.read(abs)).toBe('hello world')
  })

  it('reads @plugin/ path from plugin dir', async () => {
    const pluginDir = await makeTempDir()
    await writeFile(pluginDir, 'assets/schema.json', '{"plugin":true}')
    const fsUtils = createFsUtils(dir, null, pluginDir)
    expect(await fsUtils.read('@plugin/assets/schema.json')).toBe('{"plugin":true}')
  })

  it('@plugin/ throws when no pluginDir is set', async () => {
    const fsUtils = createFsUtils(dir, null, null)
    await expect(fsUtils.read('@plugin/assets/schema.json')).rejects.toThrow('@plugin/')
  })

  it('returns null for missing file when throw:false', async () => {
    const fsUtils = createFsUtils(dir, null)
    expect(await fsUtils.read('./missing.txt', { throw: false })).toBeNull()
  })

  it('throws for missing file by default', async () => {
    const fsUtils = createFsUtils(dir, null)
    await expect(fsUtils.read('./missing.txt')).rejects.toThrow()
  })
})

describe('createFsUtils — permission enforcement', () => {
  let dir

  beforeEach(async () => {
    dir = await makeTempDir()
    await writeFile(dir, 'package.json', '{}')
    await writeFile(dir, 'src/index.ts', '')
  })

  it('allows access when pattern matches canonical ./ token', async () => {
    const fsUtils = createFsUtils(dir, checkerFor(['fs.read:./package.json']))
    await expect(fsUtils.read('./package.json')).resolves.toBeDefined()
  })

  it('allows access with ./** wildcard', async () => {
    const fsUtils = createFsUtils(dir, checkerFor(['fs.read:./**']))
    await expect(fsUtils.read('./package.json')).resolves.toBeDefined()
    await expect(fsUtils.read('./src/index.ts')).resolves.toBeDefined()
  })

  it('throws PermissionError when pattern does not match', async () => {
    const fsUtils = createFsUtils(dir, checkerFor(['fs.read:./src/**']))
    await expect(fsUtils.read('./package.json')).rejects.toThrow(PermissionError)
  })

  it('traversal path blocked when not in allow list', async () => {
    const fsUtils = createFsUtils(dir, checkerFor(['fs.read:./**']))
    await expect(fsUtils.read('../outside/file.txt')).rejects.toThrow(PermissionError)
  })

  it('@plugin/ path allowed via augmented allow (as in runner.js)', async () => {
    const pluginDir = await makeTempDir()
    await writeFile(pluginDir, 'assets/s.json', '{}')
    const check = checkerFor(['fs.read:./**', 'fs.read:@plugin/**'])
    const fsUtils = createFsUtils(dir, check, pluginDir)
    await expect(fsUtils.read('@plugin/assets/s.json')).resolves.toBeDefined()
  })

  it('@plugin/ path denied by explicit deny entry', async () => {
    const pluginDir = await makeTempDir()
    await writeFile(pluginDir, 'secrets/key.pem', 'secret')
    const check = makePermissionChecker({
      allow: ['fs.read:@plugin/**'],
      deny: ['fs.read:@plugin/secrets/**'],
    })
    const fsUtils = createFsUtils(dir, check, pluginDir)
    await expect(fsUtils.read('@plugin/secrets/key.pem')).rejects.toThrow(PermissionError)
  })
})

describe('createFsUtils — glob', () => {
  let dir

  beforeEach(async () => {
    dir = await makeTempDir()
    await writeFile(dir, 'a.ts', '')
    await writeFile(dir, 'b.ts', '')
    await writeFile(dir, 'src/c.ts', '')
  })

  it('returns matching files', async () => {
    const fsUtils = createFsUtils(dir, null)
    const results = await fsUtils.glob('*.ts')
    expect(results).toContain('a.ts')
    expect(results).toContain('b.ts')
  })

  it('throws for absolute glob pattern', async () => {
    const fsUtils = createFsUtils(dir, null)
    await expect(fsUtils.glob('/etc/**')).rejects.toThrow('absolute')
  })
  it('canonicalizes glob pattern for permission check', async () => {
    const spy = vi.fn()
    const fsUtils = createFsUtils(dir, spy)
    await fsUtils.glob('src/*.ts')
    expect(spy).toHaveBeenCalledWith('fs.glob', './src/*.ts')
  })
})

describe('createFsUtils — file writing', () => {
  let dir

  beforeEach(async () => {
    dir = await makeTempDir()
  })

  it('writes to a new file and creates parent directories', async () => {
    const fsUtils = createFsUtils(dir, null)
    await fsUtils.write('./new-dir/sub-dir/file.txt', 'new content')
    expect(await fs.readFile(path.join(dir, 'new-dir/sub-dir/file.txt'), 'utf8')).toBe('new content')
  })

  it('throws PermissionError if write is not allowed', async () => {
    const fsUtils = createFsUtils(dir, checkerFor(['fs.write:./allowed.txt']))
    await expect(fsUtils.write('./denied.txt', 'content')).rejects.toThrow(PermissionError)
  })

  it('checks fs.write capability', async () => {
    const spy = vi.fn()
    const fsUtils = createFsUtils(dir, spy)
    await fsUtils.write('./test.txt', 'content').catch(() => {})
    expect(spy).toHaveBeenCalledWith('fs.write', './test.txt')
  })
})

describe('createFsUtils — @project/ paths', () => {
  let dir

  beforeEach(async () => {
    dir = await makeTempDir()
    await writeFile(dir, 'src/utils/foo.ts', 'export {}')
  })

  it('@project/ token normalizes to ./relative path', async () => {
    const spy = vi.fn()
    await createFsUtils(dir, spy).read('@project/src/utils/foo.ts').catch(() => {})
    expect(spy).toHaveBeenCalledWith('fs.read', './src/utils/foo.ts')
  })

  it('@project/ resolves to project root and reads file content', async () => {
    const checker = checkerFor(['fs.read:./src/**'])
    const content = await createFsUtils(dir, checker).read('@project/src/utils/foo.ts')
    expect(content).toBe('export {}')
  })

  it('@project/ read is blocked when fs.read not granted', async () => {
    const checker = checkerFor([])
    await expect(createFsUtils(dir, checker).read('@project/src/utils/foo.ts'))
      .rejects.toThrow()
  })

  it('@project/ exists checks correct path', async () => {
    const spy = vi.fn().mockReturnValue(undefined)
    await createFsUtils(dir, spy).exists('@project/src/utils/foo.ts').catch(() => {})
    expect(spy).toHaveBeenCalledWith('fs.read', './src/utils/foo.ts')
  })

  it('@project/ write normalizes token to ./relative path', async () => {
    const spy = vi.fn()
    await createFsUtils(dir, spy).write('@project/out/result.txt', 'hi').catch(() => {})
    expect(spy).toHaveBeenCalledWith('fs.write', './out/result.txt')
  })
})

describe('createFsUtils — store path resolution', () => {
  let dir, storeDir

  beforeEach(async () => {
    dir      = await makeTempDir()
    storeDir = await makeTempDir()
  })

  afterEach(async () => {
    await fs.rm(dir,      { recursive: true, force: true })
    await fs.rm(storeDir, { recursive: true, force: true })
  })

  it('@project/ path reads from project dir', async () => {
    await writeFile(dir, 'sub/file.txt', 'hello')
    const result = await createFsUtils(dir, null).read('@project/sub/file.txt')
    expect(result).toBe('hello')
  })

  it('@project/ canonical token strips to ./subpath', async () => {
    const spy = vi.fn()
    await createFsUtils(dir, spy).read('@project/foo.txt').catch(() => {})
    expect(spy).toHaveBeenCalledWith('fs.read', './foo.txt')
  })

  it('@plugin-sqlite/ produces verbatim canonical token', async () => {
    const spy = vi.fn()
    await createFsUtils(dir, spy, null, 'plug@1.0', storeDir)
      .exists('@plugin-sqlite/mydb.sqlite').catch(() => {})
    expect(spy).toHaveBeenCalledWith('fs.read', '@plugin-sqlite/mydb.sqlite')
  })

  it('@project-sqlite/ produces verbatim canonical token', async () => {
    const spy = vi.fn()
    await createFsUtils(dir, spy, null, null, storeDir)
      .exists('@project-sqlite/mydb.sqlite').catch(() => {})
    expect(spy).toHaveBeenCalledWith('fs.read', '@project-sqlite/mydb.sqlite')
  })
})

describe('createFsUtils — copy', () => {
  let dir, storeDir

  beforeEach(async () => {
    dir      = await makeTempDir()
    storeDir = await makeTempDir()
  })

  afterEach(async () => {
    await fs.rm(dir,      { recursive: true, force: true })
    await fs.rm(storeDir, { recursive: true, force: true })
  })

  it('copy transfers file contents', async () => {
    await writeFile(dir, 'src.txt', 'binary-data')
    await createFsUtils(dir, null).copy('./src.txt', './dest.txt')
    expect(await fs.readFile(path.join(dir, 'dest.txt'), 'utf8')).toBe('binary-data')
  })

  it('copy creates destination parent directories', async () => {
    await writeFile(dir, 'src.txt', 'x')
    await createFsUtils(dir, null).copy('./src.txt', './deep/nested/dest.txt')
    const abs = path.join(dir, 'deep', 'nested', 'dest.txt')
    expect(await fs.readFile(abs, 'utf8')).toBe('x')
  })

  it('copy checks fs.read on src token', async () => {
    await writeFile(dir, 'src.txt', 'x')
    const spy = vi.fn()
    await createFsUtils(dir, spy).copy('./src.txt', './dest.txt').catch(() => {})
    expect(spy).toHaveBeenCalledWith('fs.read', './src.txt')
  })

  it('copy checks fs.write on dest token', async () => {
    await writeFile(dir, 'src.txt', 'x')
    const spy = vi.fn()
    await createFsUtils(dir, spy).copy('./src.txt', './dest.txt').catch(() => {})
    expect(spy).toHaveBeenCalledWith('fs.write', './dest.txt')
  })

  it('copy to @plugin-sqlite/ uses verbatim canonical token', async () => {
    await writeFile(dir, 'seed.sqlite', 'x')
    const spy = vi.fn()
    await createFsUtils(dir, spy, null, 'plug@1.0', storeDir)
      .copy('./seed.sqlite', '@plugin-sqlite/mydb.sqlite').catch(() => {})
    expect(spy).toHaveBeenCalledWith('fs.write', '@plugin-sqlite/mydb.sqlite')
  })

  it('copy PermissionError when fs.read not granted', async () => {
    await writeFile(dir, 'src.txt', 'x')
    const checker = makePermissionChecker({ allow: [], deny: [] })
    await expect(createFsUtils(dir, checker).copy('./src.txt', './dest.txt'))
      .rejects.toThrow(PermissionError)
  })
})

describe('createFsUtils — append', () => {
  let dir

  beforeEach(async () => { dir = await makeTempDir() })
  afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }) })

  it('appends text to an existing file', async () => {
    await writeFile(dir, 'log.txt', 'line1\n')
    const fsUtils = createFsUtils(dir, null)
    await fsUtils.append('log.txt', 'line2\n')
    expect(await fs.readFile(path.join(dir, 'log.txt'), 'utf8')).toBe('line1\nline2\n')
  })

  it('creates file and parent dirs when missing', async () => {
    const fsUtils = createFsUtils(dir, null)
    await fsUtils.append('deep/dir/log.txt', 'hello')
    expect(await fs.readFile(path.join(dir, 'deep/dir/log.txt'), 'utf8')).toBe('hello')
  })

  it('requires fs.write permission', async () => {
    const fsUtils = createFsUtils(dir, checkerFor([]))
    await expect(fsUtils.append('log.txt', 'x')).rejects.toThrow(PermissionError)
  })
})

describe('createFsUtils — appendAsBytes', () => {
  let dir

  beforeEach(async () => { dir = await makeTempDir() })
  afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }) })

  it('appends binary bytes to an existing file', async () => {
    await fs.writeFile(path.join(dir, 'data.bin'), Buffer.from([1, 2]))
    const fsUtils = createFsUtils(dir, null)
    await fsUtils.appendAsBytes('data.bin', new Uint8Array([3, 4]))
    const result = await fs.readFile(path.join(dir, 'data.bin'))
    expect(Array.from(result)).toEqual([1, 2, 3, 4])
  })

  it('requires fs.write permission', async () => {
    const fsUtils = createFsUtils(dir, checkerFor([]))
    await expect(fsUtils.appendAsBytes('data.bin', new Uint8Array([1]))).rejects.toThrow(PermissionError)
  })
})

describe('createFsUtils — chmod', () => {
  let dir

  beforeEach(async () => { dir = await makeTempDir() })
  afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }) })

  it('changes file permissions without throwing', async () => {
    await writeFile(dir, 'script.sh', '#!/bin/sh')
    const fsUtils = createFsUtils(dir, null)
    await expect(fsUtils.chmod('script.sh', 0o755)).resolves.toBeUndefined()
  })

  it('requires fs.write permission', async () => {
    await writeFile(dir, 'script.sh', '#!/bin/sh')
    const fsUtils = createFsUtils(dir, checkerFor([]))
    await expect(fsUtils.chmod('script.sh', 0o755)).rejects.toThrow(PermissionError)
  })
})

describe('createFsUtils — remove, move, stat, mkdir, readAsBytes, writeAsBytes', () => {
  let dir

  beforeEach(async () => {
    dir = await makeTempDir()
  })

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {})
  })

  it('fs.remove deletes files and recursively deletes folders', async () => {
    const fsUtils = createFsUtils(dir, null)
    await writeFile(dir, 'a.txt', 'hello')
    await writeFile(dir, 'nested/b.txt', 'world')

    await fsUtils.remove('./a.txt')
    expect(await fsUtils.exists('./a.txt')).toBe(false)

    await fsUtils.remove('./nested', { recursive: true })
    expect(await fsUtils.exists('./nested/b.txt')).toBe(false)
  })

  it('fs.remove checks fs.write permission', async () => {
    const spy = vi.fn()
    const fsUtils = createFsUtils(dir, spy)
    await fsUtils.remove('./a.txt').catch(() => {})
    expect(spy).toHaveBeenCalledWith('fs.write', './a.txt')
  })

  it('fs.move moves files and scaffolds parent directories', async () => {
    const fsUtils = createFsUtils(dir, null)
    await writeFile(dir, 'src/a.txt', 'hello')

    await fsUtils.move('src/a.txt', 'dst/b.txt')
    expect(await fsUtils.exists('src/a.txt')).toBe(false)
    expect(await fsUtils.read('dst/b.txt')).toBe('hello')
  })

  it('fs.move checks fs.read and fs.write permissions', async () => {
    const spy = vi.fn()
    const fsUtils = createFsUtils(dir, spy)
    await fsUtils.move('src/a.txt', 'dst/b.txt').catch(() => {})
    expect(spy).toHaveBeenCalledWith('fs.read', './src/a.txt')
    expect(spy).toHaveBeenCalledWith('fs.write', './dst/b.txt')
  })

  it('fs.stat returns accurate metadata', async () => {
    const fsUtils = createFsUtils(dir, null)
    await writeFile(dir, 'a.txt', 'hello')
    
    const info = await fsUtils.stat('a.txt')
    expect(info.size).toBe(5)
    expect(info.isFile).toBe(true)
    expect(info.isDirectory).toBe(false)
    expect(info.mtime).toBeDefined()
    expect(info.birthtime).toBeDefined()
  })

  it('fs.stat checks fs.read permission', async () => {
    const spy = vi.fn()
    const fsUtils = createFsUtils(dir, spy)
    await fsUtils.stat('a.txt').catch(() => {})
    expect(spy).toHaveBeenCalledWith('fs.read', './a.txt')
  })

  it('fs.mkdir creates empty folder structures', async () => {
    const fsUtils = createFsUtils(dir, null)
    await fsUtils.mkdir('./empty/nested/dir')
    expect(await fsUtils.exists('./empty/nested/dir')).toBe(true)
  })

  it('fs.mkdir checks fs.write permission', async () => {
    const spy = vi.fn()
    const fsUtils = createFsUtils(dir, spy)
    await fsUtils.mkdir('./empty/nested/dir').catch(() => {})
    expect(spy).toHaveBeenCalledWith('fs.write', './empty/nested/dir')
  })

  it('fs.readAsBytes and fs.writeAsBytes handle raw binary bytes', async () => {
    const fsUtils = createFsUtils(dir, null)
    const bytes = new Uint8Array([72, 69, 76, 76, 79])
    
    await fsUtils.writeAsBytes('bin.dat', bytes)
    const readBytes = await fsUtils.readAsBytes('bin.dat')
    expect(readBytes).toEqual(bytes)
  })

  it('fs.readAsBytes and fs.writeAsBytes check permissions', async () => {
    const spy = vi.fn()
    const fsUtils = createFsUtils(dir, spy)
    const bytes = new Uint8Array([1, 2, 3])
    
    await fsUtils.writeAsBytes('bin.dat', bytes).catch(() => {})
    expect(spy).toHaveBeenCalledWith('fs.write', './bin.dat')
    
    await fsUtils.readAsBytes('bin.dat').catch(() => {})
    expect(spy).toHaveBeenCalledWith('fs.read', './bin.dat')
  })
})

