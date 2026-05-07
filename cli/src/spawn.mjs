// Tiny wrapper around node:child_process so the rest of the CLI can stay
// import-light. We exclusively use execFileSync (no shell) — never exec or
// spawn with shell:true — so user-controlled args can't trigger shell
// metacharacter injection.

import { execFileSync as _execFileSync, spawn as _spawn } from 'node:child_process';

export function runCapture(file, args, opts = {}) {
  return _execFileSync(file, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    ...opts
  });
}

export function tryRunCapture(file, args, opts = {}) {
  try {
    return runCapture(file, args, opts);
  } catch {
    return null;
  }
}

export function runInherit(file, args, opts = {}) {
  return _execFileSync(file, args, { stdio: 'inherit', ...opts });
}

export function spawnDetached(file, args, opts = {}) {
  const child = _spawn(file, args, { detached: true, stdio: 'ignore', ...opts });
  child.unref();
  return child;
}
