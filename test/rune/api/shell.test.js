import { describe, it, expect } from 'vitest';
import { createShellUtils } from '../../../src/rune/api/shell.js';

describe('shell utils', () => {
  it('runs a simple command', async () => {
    const shellUtils = createShellUtils(process.cwd());
    const result = await shellUtils.run('node -e "console.log(\'hello\')"');
    expect(result).toBe('hello');
  });

  it('runs an interactive session', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
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
      const session = shellUtils.session(`node ${scriptPath}`);
      await session.expect('Question:');
      session.write('42\n');
      const exitCode = await session.waitForExit();
      
      expect(exitCode).toBe(0);
      expect(session.output()).toContain('Correct');
    } finally {
      await fs.unlink(scriptPath);
    }
  });
});
