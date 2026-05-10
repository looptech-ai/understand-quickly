// `understand-quickly add` — the core flow.
//
// Detects repo + graph + format, prompts for the bits we can't infer,
// prints the entry, and offers to either open a prefilled issue or open
// a PR via `gh`.

import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, platform } from 'node:os';

import {
  parseGitRemote, readOriginUrl, findRepoRoot, readDefaultBranch,
  findGraphFiles, sniffGraphFile, GRAPH_CANDIDATES
} from './detect.mjs';
import {
  buildEntry, buildRawGithubUrl, buildIssueUrl, parseTags,
  FORMAT_TO_PATH, insertEntry
} from './format.mjs';
import { ask, confirm, pick, isTTY } from './prompt.mjs';
import { runCapture, tryRunCapture, runInherit, spawnDetached } from './spawn.mjs';

const KNOWN_FORMATS = [
  'understand-anything@1',
  'gitnexus@1',
  'code-review-graph@1',
  'bundle@1',
  'generic@1'
];

const DEFAULT_REGISTRY = 'looptech-ai/understand-quickly';

/** Open a URL in the user's default browser. Best-effort. */
function openUrl(url) {
  const p = platform();
  try {
    if (p === 'darwin') spawnDetached('open', [url]);
    else if (p === 'win32') spawnDetached('cmd', ['/c', 'start', '', url]);
    else spawnDetached('xdg-open', [url]);
    return true;
  } catch {
    return false;
  }
}

function log(...args) { process.stderr.write(args.join(' ') + '\n'); }

function parseArgs(argv) {
  const flags = {
    id: null,
    format: null,
    graphUrl: null,
    description: null,
    tags: null,
    printEntry: false,
    openIssue: false,
    openPr: false,
    registry: DEFAULT_REGISTRY,
    cwd: process.cwd()
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case '--id': flags.id = next(); break;
      case '--format': flags.format = next(); break;
      case '--graph-url': flags.graphUrl = next(); break;
      case '--description': flags.description = next(); break;
      case '--tags': flags.tags = next(); break;
      case '--print-entry': flags.printEntry = true; break;
      case '--open-issue': flags.openIssue = true; break;
      case '--open-pr': flags.openPr = true; break;
      case '--registry': flags.registry = next(); break;
      case '--cwd': flags.cwd = next(); break;
      default:
        if (a.startsWith('--')) throw new Error(`unknown flag: ${a}`);
        break;
    }
  }
  return flags;
}

async function resolveId(flags) {
  if (flags.id) return flags.id;
  const url = readOriginUrl(flags.cwd);
  if (!url) {
    throw new Error(
      'could not read git remote (not a repo, or no `origin`).\n' +
      '  pass --id owner/repo to override.'
    );
  }
  return parseGitRemote(url);
}

async function resolveGraph(flags, repoRoot) {
  // Honor explicit overrides first.
  if (flags.graphUrl) {
    const format = flags.format || (await pickFormatInteractive());
    return { format, graphUrl: flags.graphUrl, sourcePath: null };
  }

  const candidates = repoRoot ? findGraphFiles(repoRoot) : [];

  if (candidates.length === 0) {
    log('  no graph file found in common locations:');
    for (const c of GRAPH_CANDIDATES) log(`    - ${c}`);
    log('');
    if (flags.format) {
      const path = FORMAT_TO_PATH[flags.format] || 'graph.json';
      return { format: flags.format, sourcePath: path, _missing: true };
    }
    throw new Error(
      'no graph file found and no --graph-url / --format supplied.\n' +
      '  generate one with one of the supported tools first, or pass --graph-url.'
    );
  }

  let chosen = candidates[0];
  if (candidates.length > 1 && isTTY()) {
    const idx = await pick(
      'multiple graph files found. pick one:',
      candidates.map(c => c.rel),
      { default: 0 }
    );
    chosen = candidates[idx];
  }

  const sniffed = sniffGraphFile(chosen.path);
  let format = flags.format || sniffed.format;
  if (sniffed.parseError && !flags.format) {
    log(`  warning: could not sniff format (${sniffed.parseError}).`);
  }

  if (!format) {
    log('  could not auto-detect format.');
    format = await pickFormatInteractive();
  } else if (isTTY() && !flags.format && sniffed.format) {
    const ok = await confirm(`  detected format: ${format}. use it?`, { default: true });
    if (!ok) format = await pickFormatInteractive();
  }

  return { format, sourcePath: chosen.rel, sniffed: sniffed.format };
}

async function pickFormatInteractive() {
  if (!isTTY()) {
    throw new Error('cannot infer format non-interactively; pass --format <name>@<int>');
  }
  const idx = await pick('which format does your graph use?', KNOWN_FORMATS, { default: 0 });
  return KNOWN_FORMATS[idx];
}

async function resolveDescription(flags, id) {
  if (flags.description) return flags.description.trim();
  const fallback = `Knowledge graph for ${id}.`;
  if (!isTTY()) return fallback;
  const answered = await ask('one-line description (optional):', { default: '' });
  return answered && answered.trim().length > 0 ? answered.trim() : fallback;
}

async function action_openPr(entry, registry) {
  const ghPath = tryRunCapture('which', ['gh']);
  if (!ghPath || !ghPath.trim()) {
    log('  `gh` CLI not found. Falling back to printing the diff:');
    return printDiff(entry, registry);
  }

  // Make a tmp checkout of the registry repo, edit registry.json, push.
  const tmp = mkdtempSync(join(tmpdir(), 'uq-cli-'));
  log(`  cloning ${registry} into ${tmp} ...`);
  try {
    runInherit('gh', ['repo', 'fork', registry, '--clone=true', '--remote=true'], { cwd: tmp });
  } catch (e) {
    log(`  fork failed: ${e.message}. falling back to diff.`);
    return printDiff(entry, registry);
  }

  const repoName = registry.split('/')[1];
  const checkout = join(tmp, repoName);
  const branchName = `add-${entry.id.replace('/', '-')}-${Date.now()}`;

  try {
    runCapture('git', ['checkout', '-b', branchName], { cwd: checkout });
    const regPath = join(checkout, 'registry.json');
    const reg = JSON.parse(readFileSync(regPath, 'utf8'));
    const next = insertEntry(reg, entry);
    writeFileSync(regPath, JSON.stringify(next, null, 2) + '\n');
    runCapture('git', ['add', 'registry.json'], { cwd: checkout });
    runCapture('git', ['commit', '-m', `Add ${entry.id} to registry`], { cwd: checkout });
    runCapture('git', ['push', '-u', 'origin', branchName], { cwd: checkout });
    runInherit('gh', [
      'pr', 'create',
      '--repo', registry,
      '--title', `Add ${entry.id} to registry`,
      '--body', prBody(entry),
      '--head', `${currentForkOwner(checkout)}:${branchName}`
    ], { cwd: checkout });
    log('  PR opened.');
  } catch (e) {
    log(`  PR flow failed: ${e.message}. falling back to diff.`);
    printDiff(entry, registry);
  }
}

function currentForkOwner(checkout) {
  // After `gh repo fork`, origin points at the fork — read its URL.
  const url = tryRunCapture('git', ['remote', 'get-url', 'origin'], { cwd: checkout });
  if (!url) return null;
  try { return parseGitRemote(url.trim()).split('/')[0]; }
  catch { return null; }
}

function prBody(entry) {
  return [
    `<!-- generated by @looptech-ai/understand-quickly-cli -->`,
    ``,
    `Adds \`${entry.id}\` to the registry.`,
    ``,
    `- format: \`${entry.format}\``,
    `- graph_url: ${entry.graph_url}`,
    entry.description ? `- description: ${entry.description}` : null
  ].filter(Boolean).join('\n');
}

function printDiff(entry, registry) {
  process.stderr.write(`\n  registry to edit: ${registry}\n`);
  process.stderr.write('  add the following entry to registry.json -> entries[]:\n\n');
  process.stdout.write(JSON.stringify(entry, null, 2) + '\n');
}

function helpText() {
  return [
    'understand-quickly add — list your repo in the public registry.',
    '',
    'What it does:',
    '  Auto-detects your repo id, default branch, and existing knowledge-graph file.',
    '  Prints the registry entry it would submit, then offers to either:',
    '    • open a prefilled GitHub issue (no PR skills needed), or',
    '    • open a PR via `gh` if you have it installed.',
    '',
    'Quickstart (run inside a git repo with a knowledge-graph file already committed):',
    '  npx @looptech-ai/understand-quickly-cli add',
    '',
    'Don\'t have a graph file yet? Pick a producer first:',
    '  - Understand-Anything → .understand-anything/knowledge-graph.json',
    '  - GitNexus            → .gitnexus/graph.json',
    '  - code-review-graph   → .crg/graph.json',
    '  - Repomix / gitingest → write a bundle@1 sidecar; see docs/integrations/protocol.md',
    '  - any custom tool     → emit {nodes, edges} JSON; pick generic@1',
    '',
    'Usage:',
    '  npx @looptech-ai/understand-quickly-cli add [flags]',
    '',
    'Flags:',
    '  --id <owner/repo>          override auto-detected id',
    '  --format <name>@<int>      override sniffed format',
    '                             (' + KNOWN_FORMATS.join(', ') + ')',
    '  --graph-url <url>          override computed graph URL',
    '  --description "<text>"     one-line description (max 200 chars)',
    '  --tags a,b,c               tags as comma-separated list',
    '  --print-entry              print the entry JSON, exit (default in non-TTY)',
    '  --open-issue               open a prefilled GitHub issue in the browser',
    '  --open-pr                  open a PR via `gh` (forks the registry repo)',
    '  --registry <owner/repo>    override registry repo (default: ' + DEFAULT_REGISTRY + ')',
    '  --cwd <path>               run as if from this directory',
    '  --help                     show this help',
    '',
    'Stuck or non-technical?',
    '  Use the wizard at https://looptech-ai.github.io/understand-quickly/add.html',
    '  or the FAQ at https://github.com/looptech-ai/understand-quickly/blob/main/docs/faq.md',
    ''
  ].join('\n');
}

export async function runAdd(argv) {
  const flags = parseArgs(argv);

  // 1. Resolve id.
  log('understand-quickly add\n');
  const id = await resolveId(flags);
  log(`  id: ${id}`);

  // 2. Find repo root + branch.
  const repoRoot = findRepoRoot(flags.cwd);
  const branch = readDefaultBranch(flags.cwd) || 'main';
  log(`  branch: ${branch}`);

  // 3. Resolve format + graph path.
  const { format, sourcePath, _missing } = await resolveGraph(flags, repoRoot);
  log(`  format: ${format}`);
  if (sourcePath) log(`  graph file: ${sourcePath}${_missing ? ' (not present yet)' : ''}`);

  // 4. Compute graph URL.
  const graphUrl = flags.graphUrl
    ? flags.graphUrl
    : buildRawGithubUrl(id, branch, sourcePath || FORMAT_TO_PATH[format] || 'graph.json');
  log(`  graph_url: ${graphUrl}`);

  // 5. Description + tags.
  const description = await resolveDescription(flags, id);
  const tags = parseTags(flags.tags);

  // 6. Build entry.
  const entry = buildEntry({
    id,
    format,
    graph_url: graphUrl,
    default_branch: branch,
    description,
    tags
  });

  // 7. Show entry.
  log('\nentry:');
  process.stderr.write(JSON.stringify(entry, null, 2) + '\n\n');

  // 8. Decide action.
  const wantPrint = flags.printEntry || (!flags.openIssue && !flags.openPr && !isTTY());

  if (wantPrint) {
    process.stdout.write(JSON.stringify(entry, null, 2) + '\n');
    return 0;
  }

  let action = null;
  if (flags.openPr) action = 'pr';
  else if (flags.openIssue) action = 'issue';
  else if (isTTY()) {
    const idx = await pick(
      'what next?',
      [
        'open a prefilled GitHub issue (the registry bot opens the PR)',
        'open a PR directly via `gh`',
        'just print the entry to stdout'
      ],
      { default: 0 }
    );
    action = ['issue', 'pr', 'print'][idx];
  } else {
    action = 'print';
  }

  if (action === 'issue') {
    const url = buildIssueUrl(flags.registry, entry);
    log(`  opening issue: ${url}`);
    if (!openUrl(url)) {
      log('  could not open browser; here is the URL:');
      process.stdout.write(url + '\n');
    }
  } else if (action === 'pr') {
    await action_openPr(entry, flags.registry);
  } else {
    process.stdout.write(JSON.stringify(entry, null, 2) + '\n');
  }
  return 0;
}

export { helpText, parseArgs };
