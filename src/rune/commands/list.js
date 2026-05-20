import Table from 'cli-table3';
import { loadConfig } from '../../core/config.js'
import { getRune } from '../resolver.js'
import { output } from '../../shared/output.js';

export async function handler({
  format = 'md',
  plain = false,
  projectRoot = process.cwd(),
  configRoot = projectRoot,
} = {}) {
  let config;
  try {
    config = loadConfig(configRoot);
  } catch (err) {
    output.error(`Config unreadable: ${err.message}`);
    output.info('Run `crunes init` to create a config file.');
    process.exit(1);
  }

  const runes = config.runes ?? {};
  const keys = Object.keys(runes);

  if (keys.length === 0) {
    process.stdout.write('No runes configured. Run `crunes create <key>` to add one.\n');
    return;
  }

  const entries = keys.map(key => {
    const entry = getRune(config, key);
    const source = entry.plugin ? `→ ${entry.plugin}` : (entry.path ?? '');
    return { key, source, name: entry.name ?? null, description: entry.description ?? null };
  });

  if (format === 'json') {
    process.stdout.write(JSON.stringify(entries, null, 2) + '\n');
    return;
  }

  if (plain) {
    for (const { key, name, description, source } of entries) {
      process.stdout.write(`${key}\t${name ?? ''}\t${description ?? ''}\t${source}\n`);
    }
    return;
  }

  const table = new Table({
    head: ['Key', 'Name', 'Description', 'Source'],
    style: { head: ['cyan'] },
  });

  for (const { key, name, description, source } of entries) {
    table.push([key, name ?? '', description ?? '', source]);
  }

  process.stdout.write(table.toString() + '\n');
}
