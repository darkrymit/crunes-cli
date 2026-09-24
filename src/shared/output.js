import chalk from 'chalk';
import * as clack from '@clack/prompts';

let _plain = false;
export let isVerbose = false;

export function isPlain() { return _plain; }

export function configure({ plain = false, verbose = false } = {}) {
  _plain = plain;
  isVerbose = verbose;
  if (plain) chalk.level = 0;
}

const sym = {
  ok:   () => _plain ? '[ok]'   : chalk.green('✓'),
  err:  () => _plain ? '[err]'  : chalk.red('✗'),
  warn: () => _plain ? '[warn]' : chalk.yellow('⚠'),
  info: () => _plain ? '[info]' : chalk.blue('ℹ'),
};

export const output = {
  header(label) {
    if (_plain) {
      console.log(`=== ${label} ===`);
    } else {
      console.log(chalk.dim('─'.repeat(40)));
      console.log(chalk.bold(label));
    }
  },
  success(msg) {
    console.log(`${sym.ok()} ${msg}`);
  },
  error(msg) {
    console.error(`${sym.err()} ${msg}`);
  },
  warn(msg) {
    console.warn(`${sym.warn()} ${msg}`);
  },
  info(msg) {
    console.log(`${sym.info()} ${msg}`);
  },
  // clack draws its frame with box characters and knows nothing about --plain, whose
  // contract is "no box-drawing". Under --plain these degrade to ordinary lines.
  intro(msg) {
    if (_plain) console.log(`${sym.info()} ${msg}`);
    else clack.intro(msg);
  },
  outro(msg) {
    if (_plain) console.log(`${sym.ok()} ${msg}`);
    else clack.outro(msg);
  },
  cancel(msg) {
    if (_plain) console.error(`${sym.err()} ${msg}`);
    else clack.cancel(msg);
  },
  note(body, title) {
    if (_plain) {
      console.log(`=== ${title} ===`);
      console.log(body);
    } else {
      clack.note(body, title);
    }
  },
  log: {
    success(msg) {
      if (_plain) console.log(`${sym.ok()} ${msg}`);
      else clack.log.success(msg);
    },
    warn(msg) {
      if (_plain) console.warn(`${sym.warn()} ${msg}`);
      else clack.log.warn(msg);
    },
    error(msg) {
      if (_plain) console.error(`${sym.err()} ${msg}`);
      else clack.log.error(msg);
    },
  },
};
