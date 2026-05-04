import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { intro, outro, text, select, cancel } from '@clack/prompts';
import { output } from '../utils/output.js';

const VALID_FORMATS = ['tree', 'markdown'];

function template(key, format) {
  const header = [
    `// permissions:`,
    `//   use:`,
    `//     allow: []  \u2014 add patterns like fs.read:./** if you use utils.fs`,
    `//     deny:  []`,
    ``,
    `export async function use(dir, args, utils) {`,
    `  // dir   \u2014 absolute path to the user's project root`,
    `  // args  \u2014 string[] passed via $${key}=arg1,arg2`,
    `  // utils \u2014 { md, tree, section, fs, json, shell, fetch, env, vars, rune }`,
    `  //`,
    `  // utils.section.selected()         \u2192 string[] | null \u2014 requested section patterns`,
    `  // utils.section.match(name)        \u2192 bool            \u2014 true if section is requested`,
    `  // utils.section.create(name, data) \u2192 Section         \u2014 build a section object`,
  ].join('\n');

  if (format === 'tree') {
    return header + '\n' + [
      ``,
      `  const root = utils.tree.node('${key}', 'Root description', [`,
      `    utils.tree.node('child', 'Child description'),`,
      `  ]);`,
      `  return utils.section.create('example-tree', { type: 'tree', root });`,
      `}`,
      ``,
    ].join('\n');
  }

  // markdown
  return header + '\n' + [
    ``,
    `  const content = [`,
    `    utils.md.h3('${key}'),`,
    `    utils.md.ul(['Replace with real data']),`,
    `  ].join('\\n');`,
    `  return utils.section.create('example-md', { type: 'markdown', content });`,
    `}`,
    ``,
  ].join('\n');
}

export async function handler({
  key,
  format,
  path: runeRelPath,
  name,
  description,
  yes = false,
  projectRoot = process.cwd(),
} = {}) {
  const isNonInteractive = yes || !process.stdout.isTTY;

  if (isNonInteractive) {
    if (!key) {
      output.error('Missing required argument: <key>');
      process.exit(1);
    }
    if (!format || !VALID_FORMATS.includes(format)) {
      output.error(`Missing or invalid --format. Must be one of: ${VALID_FORMATS.join(', ')}`);
      process.exit(1);
    }
  } else {
    intro('crunes create');

    if (!key) {
      const result = await text({ message: 'Rune key?', validate: v => v ? undefined : 'Required' });
      if (result === Symbol.for('clack:cancel')) { cancel('Cancelled.'); return; }
      key = result;
    }

    if (!format) {
      const result = await select({
        message: 'Output format?',
        options: [
          { value: 'tree', label: 'tree', hint: 'hierarchical ASCII tree structure' },
          { value: 'markdown', label: 'markdown', hint: 'freeform markdown content' },
        ],
      });
      if (result === Symbol.for('clack:cancel')) { cancel('Cancelled.'); return; }
      format = result;
    }

    if (!runeRelPath) {
      const defaultPath = `.crunes/runes/${key}.js`;
      const result = await text({ message: 'File path?', initialValue: defaultPath });
      if (result === Symbol.for('clack:cancel')) { cancel('Cancelled.'); return; }
      runeRelPath = result;
    }

    if (!name) {
      const result = await text({ message: 'Name? (optional)', placeholder: 'Human-readable label for crunes list' });
      if (result === Symbol.for('clack:cancel')) { cancel('Cancelled.'); return; }
      name = result || undefined;
    }

    if (!description) {
      const result = await text({ message: 'Description? (optional)', placeholder: 'What context does this rune provide?' });
      if (result === Symbol.for('clack:cancel')) { cancel('Cancelled.'); return; }
      description = result || undefined;
    }
  }

  runeRelPath = runeRelPath ?? `.crunes/runes/${key}.js`;
  const runeAbsPath = join(projectRoot, runeRelPath);

  mkdirSync(dirname(runeAbsPath), { recursive: true });
  writeFileSync(runeAbsPath, template(key, format));

  // Register in config — write object format to support name/description
  const configPath = join(projectRoot, '.crunes', 'config.json');
  let config = { runes: {} };
  if (existsSync(configPath)) {
    try { config = JSON.parse(readFileSync(configPath, 'utf8')); } catch {}
  }
  const entry = {
    path: runeRelPath,
    ...(name && { name }),
    ...(description && { description })
  };
  config.runes = { ...(config.runes ?? {}), [key]: entry };
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');

  if (!isNonInteractive) {
    outro(`Created ${runeRelPath}\nRun: crunes query ${key}`);
  } else {
    output.success(`Created ${runeRelPath}`);
    output.info(`Run: crunes query ${key}`);
  }
}
