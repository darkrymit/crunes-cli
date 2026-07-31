import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { intro, outro, confirm, cancel } from '@clack/prompts';
import { output } from '../../shared/output.js';
import { getConfigPath } from '../config-writer.js';

const EMPTY_CONFIG = JSON.stringify({ runes: {} }, null, 2) + '\n';
const GITIGNORE_CONTENT = '# local overrides (machine-specific, never commit)\nconfig.local.json\nproject.local.json\n\n# run logs\nlogs/\n\n# local caches, databases, schema cache and job logs (gitignored by default)\ncaches/\nschemas/\nsqlite/\njobs/\n';

export async function handler({
  yes = false,
  projectRoot = process.cwd(),
  global = false,
} = {}) {
  const configPath = getConfigPath({ configRoot: projectRoot, global });
  const configDir = dirname(configPath);
  const isNonInteractive = yes || !process.stdout.isTTY;

  if (existsSync(configPath)) {
    if (!yes) {
      if (isNonInteractive) {
        output.error('Config already exists. Use --yes to overwrite.');
        process.exit(1);
      }

      intro('crunes init');
      const overwrite = await confirm({
        message: 'Config already exists. Overwrite?',
        initialValue: false,
      });

      if (!overwrite || overwrite === Symbol.for('clack:cancel')) {
        cancel('Cancelled.');
        return;
      }
    }
  }

  mkdirSync(configDir, { recursive: true });
  writeFileSync(configPath, EMPTY_CONFIG);

  // The store is not a git repository, so it needs no .gitignore scaffold.
  const gitignorePath = join(configDir, '.gitignore');
  if (!global && !existsSync(gitignorePath)) {
    writeFileSync(gitignorePath, GITIGNORE_CONTENT);
  }

  if (!isNonInteractive) {
    outro(`Created ${configPath}`);
  } else {
    output.success(`Created ${configPath}`);
  }
}
