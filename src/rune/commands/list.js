import Table from 'cli-table3';
import { loadConfig, LAYER, ROOTLESS } from '../../core/config.js'
import { enumerateRunes } from '../enumerate.js'
import { output } from '../../shared/output.js';

/**
 * Rune rows with the config layer each one came from. Runes contributed by a
 * plugin have no config layer and are labelled `plugin`.
 */
export async function collectListRows({ projectRoot = process.cwd(), configRoot, global = false } = {}) {
  const config = loadConfig(configRoot ?? projectRoot)
  const entries = await enumerateRunes(config)
  const rows = entries.map(entry => ({
    ...entry,
    layer: config.runes?.[entry.key] ? (config.runes[entry.key][LAYER] ?? 'project') : 'plugin',
  }))
  return {
    rows: global ? rows.filter(r => r.layer === 'global') : rows,
    rootless: config[ROOTLESS] === true,
  }
}

export async function handler({
  format = 'md',
  plain = false,
  projectRoot = process.cwd(),
  configRoot = projectRoot,
  global = false,
} = {}) {
  let entries, rootless;
  try {
    ({ rows: entries, rootless } = await collectListRows({ projectRoot, configRoot, global }));
  } catch (err) {
    output.error(`Config unreadable: ${err.message}`);
    output.info('Run `crunes init` to create a config file.');
    process.exit(1);
  }

  if (entries.length === 0) {
    process.stdout.write('No runes configured. Run `crunes create <key>` to add one.\n');
    return;
  }

  if (format === 'json') {
    process.stdout.write(JSON.stringify(entries, null, 2) + '\n');
    return;
  }

  if (plain) {
    for (const { key, name, description, source, layer } of entries) {
      process.stdout.write(`${key}\t${name ?? ''}\t${description ?? ''}\t${source}\t${layer}\n`);
    }
    return;
  }

  if (rootless) {
    process.stdout.write('no project config — global only\n');
  }

  const table = new Table({
    head: ['Key', 'Name', 'Description', 'Source', 'Layer'],
    style: { head: ['cyan'] },
  });

  for (const { key, name, description, source, layer } of entries) {
    table.push([key, name ?? '', description ?? '', source, layer]);
  }

  process.stdout.write(table.toString() + '\n');
}
