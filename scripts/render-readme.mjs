import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const STATUS_EMOJI = {
  ok: '✅',
  missing: '🟡',
  invalid: '⚠️',
  oversize: '📦',
  transient_error: '🔁',
  dead: '💀',
  renamed: '↪️',
  revoked: '🚫',
  pending: '🆕'
};

const BEGIN = '<!-- BEGIN ENTRIES -->';
const END = '<!-- END ENTRIES -->';

// Sanitize producer-supplied description text before embedding in markdown:
//   - escape backslashes first (otherwise a literal `\` in input would
//     concatenate with our pipe-escape and leak past the table-cell boundary)
//   - escape table pipes
//   - neutralize raw HTML tags (so a `<script>` in a description can't ride
//     into a downstream HTML render of the README)
//   - strip dangerous URL prefixes from inline links so a markdown renderer
//     can't be coerced into rendering `javascript:` / `data:` schemes
function sanitizeDescription(s) {
  if (!s) return '';
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/[<>]/g, (c) => (c === '<' ? '&lt;' : '&gt;'))
    .replace(/\]\(\s*(?:javascript|data|vbscript|file):/gi, '](#:');
}

export function renderTable(registry) {
  const rows = [...registry.entries].sort((a, b) => a.id.localeCompare(b.id));
  const header = '| Repo | Format | Description | Status | Last synced |';
  const sep    = '| --- | --- | --- | :---: | --- |';
  const body = rows.map(e => {
    const status = e.status || 'pending';
    const emoji = STATUS_EMOJI[status] || '❔';
    const synced = e.last_synced ? e.last_synced.slice(0, 10) : '—';
    const desc = sanitizeDescription(e.description);
    return `| [${e.id}](https://github.com/${e.id}) | \`${e.format}\` | ${desc} | ${emoji} ${status} | ${synced} |`;
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
