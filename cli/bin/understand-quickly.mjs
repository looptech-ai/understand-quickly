#!/usr/bin/env node
// Tiny entrypoint that dispatches subcommands.

import { runAdd, helpText } from '../src/add.mjs';

const TOPLEVEL_HELP = [
  '@understand-quickly/cli',
  '',
  'Usage:',
  '  understand-quickly <command> [flags]',
  '',
  'Commands:',
  '  add        register your repo with the understand-quickly registry',
  '  help       show help for the CLI or a specific command',
  '',
  'Run `understand-quickly add --help` for `add`-specific flags.',
  ''
].join('\n');

async function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];

  if (!cmd || cmd === '--help' || cmd === '-h' || cmd === 'help') {
    const sub = argv[1];
    if (sub === 'add') {
      process.stdout.write(helpText());
      return 0;
    }
    process.stdout.write(TOPLEVEL_HELP);
    return 0;
  }

  if (cmd === 'add') {
    const subArgs = argv.slice(1);
    if (subArgs.includes('--help') || subArgs.includes('-h')) {
      process.stdout.write(helpText());
      return 0;
    }
    return await runAdd(subArgs);
  }

  process.stderr.write(`unknown command: ${cmd}\n\n${TOPLEVEL_HELP}`);
  return 2;
}

main()
  .then(code => { process.exit(code || 0); })
  .catch(err => {
    process.stderr.write(`error: ${err.message}\n`);
    process.exit(1);
  });
