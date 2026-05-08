#!/usr/bin/env node
// Parse a GitHub issue body produced by .github/ISSUE_TEMPLATE/add-repo.yml
// into a registry entry, validate it, and (optionally) write it into
// registry.json. Reuses the existing validate.mjs helpers — no forked logic.
//
// Exports:
//   parseIssueBody(body) -> { id, format, graph_url, description, tags, instant_refresh }
//   buildEntry(parsed)   -> registry entry object (server-derived fields omitted)
//   addEntryToRegistry(registryPath, entry) -> void (writes file)
//
// CLI:
//   node scripts/issue-to-entry.mjs --body-file=<path> --registry=<path> [--dry-run]

import { readFileSync, writeFileSync } from 'node:fs';
import { validateRegistry, fetchAndValidate } from './validate.mjs';

// GitHub form-issue bodies render each field as `### <Label>` followed by a
// blank line and the value (which may itself span multiple lines), then a
// blank line before the next `###`. Optional fields with no input render
// as the literal string `_No response_`.
//
// We tolerate:
//   - extra blank lines between header and value
//   - CRLF line endings
//   - leading/trailing whitespace in values

const FIELD_LABELS = {
  id: 'Repo id',
  format: 'Graph format',
  graph_url: 'graph_url',
  description: 'Description',
  tags: 'Tags',
  instant_refresh: 'Optional add-ons'
};

const REQUIRED_FIELDS = ['id', 'format', 'graph_url', 'description'];

// Maximum body size we'll parse. GitHub limits issue bodies to 65536 chars but
// fork PR webhooks can carry larger payloads. Enforce a hard cap so a
// pathologically-large body can't induce a slowdown anywhere downstream.
const MAX_ISSUE_BODY_CHARS = 200_000;

// Split a GitHub form body into a `{ label: rawValue }` map. Robust to CRLF,
// extra blank lines, and trailing whitespace.
//
// Implementation note: the prior version used a single multiline regex with a
// lazy quantifier and a lookahead. That pattern is technically vulnerable to
// catastrophic backtracking on adversarial inputs (e.g., a body of 100k `#`
// characters). Splitting on `\n###` line boundaries is O(n) and not subject
// to the same pathology.
function splitSections(body) {
  let normalized = String(body || '').replace(/\r\n?/g, '\n');
  if (normalized.length > MAX_ISSUE_BODY_CHARS) {
    normalized = normalized.slice(0, MAX_ISSUE_BODY_CHARS);
  }
  const sections = {};

  // Use a sentinel split so the very first `###` (no leading newline) still
  // counts. After splitting, even-indexed elements are content before the
  // first header (discarded); after that, pairs of [label, content] follow.
  const parts = ('\n' + normalized).split(/\n###[ \t]+/);
  // parts[0] is anything before the first header — discard.
  for (let i = 1; i < parts.length; i++) {
    const chunk = parts[i];
    // Header line is everything up to the first newline; the rest is content.
    const nl = chunk.indexOf('\n');
    const label = (nl < 0 ? chunk : chunk.slice(0, nl)).trim();
    const value = (nl < 0 ? '' : chunk.slice(nl + 1))
      .replace(/^\n+/, '')
      .replace(/\n+$/, '')
      .trim();
    if (label) sections[label] = value;
  }
  return sections;
}

/**
 * Parse a GitHub issue body (from add-repo.yml) into structured fields.
 *
 * Throws on missing required fields with the offending field name in the
 * message — the workflow surfaces this directly to the user.
 */
export function parseIssueBody(body) {
  const sections = splitSections(body);

  function pick(field) {
    const label = FIELD_LABELS[field];
    if (!(label in sections)) return undefined;
    const v = sections[label];
    if (v === '' || v === '_No response_') return undefined;
    return v;
  }

  for (const f of REQUIRED_FIELDS) {
    if (pick(f) === undefined) {
      throw new Error(`Missing required field: ${FIELD_LABELS[f]}`);
    }
  }

  const id = pick('id');
  const format = pick('format');
  const graph_url = pick('graph_url');
  const description = pick('description');

  const rawTags = pick('tags');
  const tags = rawTags
    ? rawTags.split(',').map(t => t.trim()).filter(Boolean)
    : [];

  // The checkboxes block renders as `- [x] <label>` / `- [ ] <label>`. Any
  // checked box counts as opt-in. The current form only has one checkbox.
  const rawAddons = sections[FIELD_LABELS.instant_refresh] || '';
  const instant_refresh = /-\s*\[x\]/i.test(rawAddons);

  return { id, format, graph_url, description, tags, instant_refresh };
}

/**
 * Build a registry entry from a parsed issue. Only contributor-controlled
 * fields are populated — sync-derived fields (last_synced, last_sha,
 * size_bytes, status, miss_count, last_error) are intentionally omitted so
 * the sync workflow fills them in.
 *
 * `id` is `owner/repo`; we split it to populate `owner` and `repo`.
 */
export function buildEntry(parsed) {
  const id = String(parsed.id || '').trim();
  const slash = id.indexOf('/');
  if (slash <= 0 || slash === id.length - 1) {
    throw new Error(`Invalid id "${id}": must be owner/repo`);
  }
  const owner = id.slice(0, slash);
  const repo = id.slice(slash + 1);

  const entry = {
    id,
    owner,
    repo,
    format: String(parsed.format || '').trim(),
    graph_url: String(parsed.graph_url || '').trim(),
    description: String(parsed.description || '').trim()
  };
  if (Array.isArray(parsed.tags) && parsed.tags.length > 0) {
    entry.tags = parsed.tags;
  }
  return entry;
}

/**
 * Append an entry to a registry.json file on disk. Idempotent on `id`: if the
 * id is already present we throw rather than silently double-add.
 */
export function addEntryToRegistry(registryPath, entry) {
  const raw = readFileSync(registryPath, 'utf8');
  const reg = JSON.parse(raw);
  if (!Array.isArray(reg.entries)) {
    throw new Error(`registry at ${registryPath} has no entries array`);
  }
  if (reg.entries.some(e => e && e.id === entry.id)) {
    throw new Error(`registry already contains id ${entry.id}`);
  }
  reg.entries.push(entry);
  writeFileSync(registryPath, JSON.stringify(reg, null, 2) + '\n', 'utf8');
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
    if (!m) continue;
    out[m[1]] = m[2] === undefined ? true : m[2];
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args['body-file'] || !args['registry']) {
    console.error('usage: issue-to-entry.mjs --body-file=<path> --registry=<path> [--dry-run]');
    process.exit(2);
  }
  const body = readFileSync(args['body-file'], 'utf8');
  const parsed = parseIssueBody(body);
  const entry = buildEntry(parsed);

  // 1) Schema-validate the entry by wrapping it in a registry envelope.
  const v = validateRegistry({
    schema_version: 1,
    generated_at: new Date().toISOString(),
    entries: [entry]
  });
  if (!v.ok) {
    throw new Error(`Schema validation failed: ${v.errors.map(e => e.message).join('; ')}`);
  }

  // 2) Fetch + validate the graph body itself.
  const fv = await fetchAndValidate(entry);
  if (!fv.ok) {
    throw new Error(`Graph validation failed: ${fv.errors.map(e => e.message).join('; ')}`);
  }

  if (!args['dry-run']) {
    addEntryToRegistry(args['registry'], entry);
  }
  process.stdout.write(JSON.stringify(entry, null, 2) + '\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    // Single-line reason — the workflow drops it straight into a comment.
    const msg = (err && err.message ? err.message : String(err)).replace(/\s+/g, ' ').trim();
    console.error(msg);
    process.exit(1);
  });
}
