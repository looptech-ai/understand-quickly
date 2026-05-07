// Tiny readline-based prompts. We avoid any deps; this isn't trying to be
// inquirer. Each function resolves to a string (or boolean / index).
// All prompts go to stderr so stdout stays machine-pipeable for --print-entry.

import { createInterface } from 'node:readline';

function isTTY() {
  return Boolean(process.stdin.isTTY && process.stderr.isTTY);
}

function makeRL() {
  return createInterface({ input: process.stdin, output: process.stderr, terminal: true });
}

export async function ask(question, { default: dflt } = {}) {
  if (!isTTY()) {
    if (dflt !== undefined) return dflt;
    throw new Error(`non-interactive; cannot prompt: ${question}`);
  }
  const rl = makeRL();
  try {
    const suffix = dflt ? ` [${dflt}] ` : ' ';
    const answer = await new Promise(resolve => rl.question(question + suffix, resolve));
    const trimmed = answer.trim();
    if (trimmed.length === 0 && dflt !== undefined) return dflt;
    return trimmed;
  } finally {
    rl.close();
  }
}

export async function confirm(question, { default: dflt = true } = {}) {
  if (!isTTY()) return dflt;
  const hint = dflt ? '[Y/n]' : '[y/N]';
  const answer = (await ask(`${question} ${hint}`, { default: dflt ? 'y' : 'n' })) || '';
  const lower = String(answer).toLowerCase();
  if (lower === 'y' || lower === 'yes') return true;
  if (lower === 'n' || lower === 'no') return false;
  return dflt;
}

export async function pick(question, choices, { default: dflt = 0 } = {}) {
  if (!isTTY()) return dflt;
  process.stderr.write(`${question}\n`);
  for (let i = 0; i < choices.length; i++) {
    const marker = i === dflt ? '*' : ' ';
    process.stderr.write(`  ${marker} ${i + 1}) ${choices[i]}\n`);
  }
  const raw = await ask(`Pick 1-${choices.length}`, { default: String(dflt + 1) });
  const n = Number.parseInt(raw, 10);
  if (Number.isFinite(n) && n >= 1 && n <= choices.length) return n - 1;
  return dflt;
}

export { isTTY };
