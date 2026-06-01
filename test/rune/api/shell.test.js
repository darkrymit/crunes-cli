import { describe, it, expect } from 'vitest';
import { createShellUtils } from '../../../src/rune/api/shell.js';
import { runRuneInIsolate } from '../../../src/rune/isolation/runner.js';
import path from 'node:path';
import fs from 'node:fs/promises';

describe('shell utils', () => {
  it('runs a simple command', async () => {
    const shellUtils = createShellUtils(process.cwd());
    const { stdout } = await shellUtils.exec('node -e "console.log(\'hello\')"');
    expect(stdout).toBe('hello');
  });

  it('runs an interactive session', async () => {
    const shellUtils = createShellUtils(process.cwd());
    
    const scriptPath = path.join(process.cwd(), '.tmp-interactive-test.js');
    const script = `
      process.stdout.write('Question:');
      process.stdin.on('data', (d) => {
        if (d.toString().trim() === '42') {
          console.log('Correct');
          process.exit(0);
        } else {
          console.log('Wrong');
          process.exit(1);
        }
      });
    `;
    await fs.writeFile(scriptPath, script);

    try {
      const session = shellUtils.execInSession(`node ${scriptPath}`);
      let stdout = '';
      
      session.setHandler('stdout', 'data', (chunk) => {
        stdout += chunk.toString();
        if (stdout.includes('Question:')) {
          session.write('42\n');
        }
      });

      const exitPromise = new Promise((resolve) => {
        session.setHandler('session', 'exit', resolve);
      });

      const exitCode = await exitPromise;
      
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Correct');
    } finally {
      await fs.unlink(scriptPath);
    }
  });

  describe('sandboxed streaming and binary processes', () => {
    it('execInSession stdout/stderr act as text streams by default', async () => {
      const script = `
        import { shell } from '@utils'
        export async function use() {
          const session = shell.execInSession("node -e \\"process.stdin.on('data', d => { process.stdout.write('echo:' + d.toString()) })\\"")
          const reader = session.stdout.getReader()
          const writer = session.stdin.getWriter()
          
          await writer.write('hello-crunes\\n')
          const { value } = await reader.read()
          
          session.kill()
          return value
        }
      `
      const scriptPath = path.join(process.cwd(), 'scratch_test_shell_text_stream.js')
      await fs.writeFile(scriptPath, script)
      try {
        const result = await runRuneInIsolate(scriptPath, { allow: ['shell.exec:**'], deny: [] }, [], process.cwd())
        expect(result).toBe('echo:hello-crunes\n')
      } finally {
        await fs.rm(scriptPath, { force: true })
      }
    })

    it('execInSession stdout/stderr act as binary streams when binary is true', async () => {
      const script = `
        import { shell } from '@utils'
        export async function use() {
          const session = shell.execInSession('node -e "process.stdout.write(Buffer.from([65, 66, 67]))"', { binary: true })
          const reader = session.stdout.getReader()
          const { value } = await reader.read()
          session.kill()
          return {
            isUint8: value instanceof Uint8Array,
            len: value.length,
            val0: value[0],
            val1: value[1],
            val2: value[2]
          }
        }
      `
      const scriptPath = path.join(process.cwd(), 'scratch_test_shell_binary_stream.js')
      await fs.writeFile(scriptPath, script)
      try {
        const result = await runRuneInIsolate(scriptPath, { allow: ['shell.exec:**'], deny: [] }, [], process.cwd())
        expect(result.isUint8).toBe(true)
        expect(result.len).toBe(3)
        expect(result.val0).toBe(65)
        expect(result.val1).toBe(66)
        expect(result.val2).toBe(67)
      } finally {
        await fs.rm(scriptPath, { force: true })
      }
    })

    it('regular exec accepts stdin as a ReadableStream and trim: false returns full result', async () => {
      const script = `
        import { shell } from '@utils'
        export async function use() {
          const stream = new ReadableStream({
            start(c) {
              c.enqueue('piped standard input stream\\n')
              c.close()
            }
          })
          const res = await shell.exec('node -e "process.stdin.pipe(process.stdout)"', { stdin: stream, trim: false })
          return res.stdout
        }
      `
      const scriptPath = path.join(process.cwd(), 'scratch_test_shell_exec_stdin.js')
      await fs.writeFile(scriptPath, script)
      try {
        const result = await runRuneInIsolate(scriptPath, { allow: ['shell.exec:**'], deny: [] }, [], process.cwd())
        expect(result).toBe('piped standard input stream\n')
      } finally {
        await fs.rm(scriptPath, { force: true })
      }
    })

    it('regular exec returns raw Uint8Array when binary is true', async () => {
      const script = `
        import { shell } from '@utils'
        export async function use() {
          const { stdout: res } = await shell.exec('node -e "process.stdout.write(Buffer.from([10, 20, 30]))"', { binary: true })
          return {
            isUint8: res instanceof Uint8Array,
            length: res.length,
            val0: res[0],
            val1: res[1],
            val2: res[2]
          }
        }
      `
      const scriptPath = path.join(process.cwd(), 'scratch_test_shell_exec_binary.js')
      await fs.writeFile(scriptPath, script)
      try {
        const result = await runRuneInIsolate(scriptPath, { allow: ['shell.exec:**'], deny: [] }, [], process.cwd())
        expect(result.isUint8).toBe(true)
        expect(result.length).toBe(3)
        expect(result.val0).toBe(10)
        expect(result.val1).toBe(20)
        expect(result.val2).toBe(30)
      } finally {
        await fs.rm(scriptPath, { force: true })
      }
    })
  });
});
