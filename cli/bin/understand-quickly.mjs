#!/usr/bin/env node
// Tiny entrypoint that dispatches subcommands.

import { runAdd, helpText } from '../src/add.mjs';

const TOPLEVEL_HELP = [
  '@looptech-ai/understand-quickly-cli — list your repo in the public registry of code-knowledge graphs.',
  '',
  'Usage:',
  '  understand-quickly <command> [flags]',
  '',
  'Commands:',
  '  add        register your repo (auto-detects id / format / graph file)',
  '  help       show help for the CLI or a specific command',
  '',
  'Examples:',
  '  understand-quickly add               # interactive, run from your repo',
  '  understand-quickly add --open-issue  # auto-open a prefilled GitHub issue',
  '  understand-quickly add --print-entry # print the JSON; do nothing else',
  '',
  'New here? Start with the FAQ (plain-English):',
  '  https://github.com/looptech-ai/understand-quickly/blob/main/docs/faq.md',
  '',
  'Run `understand-quickly add --help` for `add`-specific flags.',
  ''
].join('\n');

function ensureNodeVersion() {
  // Engines pins >=20; npm/npx will warn but still attempt to run on older
  // Node. Surface a friendly message so a non-technical user gets a clear
  // path-forward instead of a cryptic `import.meta` or top-level-await error.
  const m = /^v(\d+)/.exec(process.version);
  const major = m ? parseInt(m[1], 10) : 0;
  if (major < 20) {
    process.stderr.write(
      `understand-quickly requires Node.js 20 or newer. ` +
      `You are running ${process.version}.\n` +
      `Install Node 20+ from https://nodejs.org/ or use nvm:\n` +
      `  nvm install 20 && nvm use 20\n`
    );
    process.exit(1);
  }
}

async function main() {
  ensureNodeVersion();
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
    process.stderr.write(
      `\nIf this error doesn't make sense, try:\n` +
      `  - The wizard: https://looptech-ai.github.io/understand-quickly/add.html\n` +
      `  - The FAQ:    https://github.com/looptech-ai/understand-quickly/blob/main/docs/faq.md\n` +
      `  - Open an issue: https://github.com/looptech-ai/understand-quickly/issues/new/choose\n`
    );
    process.exit(1);
  });
