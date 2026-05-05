import chalk from 'chalk';

let _plain = false;
export let isVerbose = false;

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
};
