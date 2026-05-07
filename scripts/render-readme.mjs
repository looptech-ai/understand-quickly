import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const STATUS_EMOJI = {
  ok: '✅',
  missing: '🟡',
  invalid: '⚠️',
  oversize: '📦',
  transient_error: '🔁',
  dead: '💀',
  renamed: '↪️'
};

const BEGIN = '<!-- BEGIN ENTRIES -->';
const END = '<!-- END ENTRIES -->';

export function renderTable(registry) {
  const rows = [...registry.entries].sort((a, b) => a.id.localeCompare(b.id));
  const header = '| Repo | Format | Description | Status | Last synced |';
  const sep    = '| --- | --- | --- | :---: | --- |';
  const body = rows.map(e => {
    const emoji = STATUS_EMOJI[e.status] || '❔';
    const synced = e.last_synced ? e.last_synced.slice(0, 10) : '—';
    const desc = (e.description || '').replace(/\|/g, '\\|');
    return `| [${e.id}](https://github.com/${e.id}) | \`${e.format}\` | ${desc} | ${emoji} ${e.status} | ${synced} |`;
  });
  return [header, sep, ...body].join('\n');
}

export function applyMarkers(template, replacement) {
  const i = template.indexOf(BEGIN);
  const j = template.indexOf(END);
  if (i < 0 || j < 0 || j < i) throw new Error(`markers not found in template`);
  return template.slice(0, i + BEGIN.length) + '\n' + replacement + '\n' + template.slice(j);
}

async function main() {
  const registry = JSON.parse(readFileSync('registry.json', 'utf8'));
  if (!existsSync('README.md')) {
    console.log('README.md not present yet; skipping render');
    return;
  }
  const tpl = readFileSync('README.md', 'utf8');
  const next = applyMarkers(tpl, renderTable(registry));
  if (next === tpl) {
    console.log('README up-to-date');
    return;
  }
  writeFileSync('README.md', next);
  console.log('README updated');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error(err); process.exit(1); });
}
