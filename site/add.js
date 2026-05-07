// add.js — wizard for /add.html
// Builds a pre-filled GitHub issue URL using the add-repo.yml form template.
// Field ids match .github/ISSUE_TEMPLATE/add-repo.yml exactly:
//   id, format, graph_url, description, tags, instant_refresh

const ISSUE_BASE = "https://github.com/looptech-ai/understand-quickly/issues/new";
const ISSUE_TEMPLATE = "add-repo.yml";

const REPO_ID_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const URL_RE = /^https:\/\/.+/i;
const DESC_MAX = 200;

const FORMAT_PATHS = {
  "understand-anything@1": ".understand-anything/knowledge-graph.json",
  "gitnexus@1":            ".gitnexus/graph.json",
  "code-review-graph@1":   ".code-review-graph/graph.json",
  "generic@1":             "graph.json",
};

// ---------- DOM refs ----------
const $id = document.getElementById("f-id");
const $url = document.getElementById("f-url");
const $desc = document.getElementById("f-desc");
const $descCount = document.getElementById("desc-count");
const $tagsInput = document.getElementById("f-tags");
const $chipList = document.getElementById("chip-list");
const $refresh = document.getElementById("f-refresh");
const $submit = document.getElementById("submit-btn");
const $copy = document.getElementById("copy-btn");
const $copyStatus = document.getElementById("copy-status");
const $form = document.getElementById("add-form");
const $togglePreview = document.getElementById("toggle-preview");
const $preview = document.getElementById("json-preview");
const $previewCode = $preview.querySelector("code");

const errEls = {
  id: document.getElementById("err-id"),
  url: document.getElementById("err-url"),
  format: document.getElementById("err-format"),
  desc: document.getElementById("err-desc"),
};

// ---------- State ----------
let tags = [];
let urlEdited = false; // tracks whether the user has manually edited the URL field

// ---------- Helpers ----------
function getFormat() {
  const r = document.querySelector('input[name="format"]:checked');
  return r ? r.value : "";
}

function suggestedUrl(repoId, format) {
  if (!repoId || !REPO_ID_RE.test(repoId) || !format) return "";
  const path = FORMAT_PATHS[format];
  if (!path) return "";
  return `https://raw.githubusercontent.com/${repoId}/main/${path}`;
}

function setFieldError(name, msg) {
  const el = errEls[name];
  if (!el) return;
  if (msg) {
    el.textContent = msg;
    el.hidden = false;
  } else {
    el.textContent = "";
    el.hidden = true;
  }
}

function setInvalid(input, isInvalid) {
  if (!input) return;
  input.classList.toggle("invalid", !!isInvalid);
}

// ---------- Validation ----------
function validate() {
  const repoId = $id.value.trim();
  const url = $url.value.trim();
  const desc = $desc.value;
  const format = getFormat();

  let ok = true;

  // id
  if (!repoId) {
    setFieldError("id", "");
    setInvalid($id, false);
    ok = false;
  } else if (!REPO_ID_RE.test(repoId)) {
    setFieldError("id", "Must match owner/repo (letters, numbers, _ . -).");
    setInvalid($id, true);
    ok = false;
  } else {
    setFieldError("id", "");
    setInvalid($id, false);
  }

  // format
  if (!format) {
    ok = false;
  }

  // graph_url
  if (!url) {
    setFieldError("url", "");
    setInvalid($url, false);
    ok = false;
  } else if (!URL_RE.test(url)) {
    setFieldError("url", "Must start with https://.");
    setInvalid($url, true);
    ok = false;
  } else {
    try {
      // catches malformed URLs that pass the simple regex
      // eslint-disable-next-line no-new
      new URL(url);
      setFieldError("url", "");
      setInvalid($url, false);
    } catch {
      setFieldError("url", "Not a valid URL.");
      setInvalid($url, true);
      ok = false;
    }
  }

  // description
  const trimmed = desc.trim();
  if (!trimmed) {
    setFieldError("desc", "");
    setInvalid($desc, false);
    ok = false;
  } else if (desc.length > DESC_MAX) {
    setFieldError("desc", `Too long: ${desc.length}/${DESC_MAX}.`);
    setInvalid($desc, true);
    ok = false;
  } else {
    setFieldError("desc", "");
    setInvalid($desc, false);
  }

  $submit.disabled = !ok;
  return ok;
}

// ---------- Description counter ----------
function updateDescCount() {
  const len = $desc.value.length;
  $descCount.textContent = String(len);
  const counter = $descCount.parentElement;
  counter.classList.toggle("warn", len > DESC_MAX * 0.9 && len <= DESC_MAX);
  counter.classList.toggle("over", len > DESC_MAX);
}

// ---------- Tags / chips ----------
function renderChips() {
  // Clear with DOM API; never use innerHTML with user-supplied tag text.
  while ($chipList.firstChild) $chipList.removeChild($chipList.firstChild);
  tags.forEach((t, i) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip";
    btn.setAttribute("aria-label", `Remove tag ${t}`);
    // tag label
    btn.appendChild(document.createTextNode(t + " "));
    // close glyph
    const x = document.createElement("span");
    x.className = "chip-x";
    x.setAttribute("aria-hidden", "true");
    x.textContent = "×"; // ×
    btn.appendChild(x);
    btn.addEventListener("click", () => {
      tags.splice(i, 1);
      renderChips();
      updatePreview();
    });
    li.appendChild(btn);
    $chipList.appendChild(li);
  });
}

function commitTagInput() {
  const raw = $tagsInput.value;
  // split on commas, trim, dedupe with existing tags, drop empties
  const parts = raw.split(",").map(s => s.trim()).filter(Boolean);
  let added = false;
  for (const p of parts) {
    const t = p.toLowerCase();
    if (t.length > 40) continue; // sanity cap
    if (!tags.includes(t)) {
      tags.push(t);
      added = true;
    }
  }
  $tagsInput.value = "";
  if (added) {
    renderChips();
    updatePreview();
  }
}

$tagsInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === ",") {
    e.preventDefault();
    commitTagInput();
  } else if (e.key === "Backspace" && $tagsInput.value === "" && tags.length) {
    e.preventDefault();
    tags.pop();
    renderChips();
    updatePreview();
  }
});
$tagsInput.addEventListener("blur", commitTagInput);
// Click anywhere in chip-host to focus the input
document.getElementById("chip-host").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) $tagsInput.focus();
});

// ---------- Auto-suggest URL ----------
function maybeSuggestUrl() {
  if (urlEdited) return;
  const id = $id.value.trim();
  const fmt = getFormat();
  const s = suggestedUrl(id, fmt);
  if (s) {
    $url.value = s;
  }
}

$url.addEventListener("input", () => {
  // user-touched only after a real keystroke; also flip back to suggestion mode if cleared
  urlEdited = $url.value.trim().length > 0;
});

// ---------- Build entry & URL ----------
function buildEntry() {
  return {
    id: $id.value.trim(),
    format: getFormat(),
    graph_url: $url.value.trim(),
    description: $desc.value.trim(),
    tags: tags.slice(),
    instant_refresh: $refresh.checked,
  };
}

function buildIssueUrl() {
  const e = buildEntry();
  const params = new URLSearchParams();
  params.set("template", ISSUE_TEMPLATE);
  params.set("title", `[add] ${e.id}`);
  params.set("id", e.id);
  params.set("format", e.format);
  params.set("graph_url", e.graph_url);
  params.set("description", e.description);
  if (e.tags.length) params.set("tags", e.tags.join(", "));
  // instant_refresh on the form is a checkboxes group; GitHub accepts the option label as value.
  params.set(
    "instant_refresh",
    e.instant_refresh
      ? "I'll also drop the publish workflow into my repo for instant-refresh on push."
      : ""
  );
  return `${ISSUE_BASE}?${params.toString()}`;
}

function updatePreview() {
  const e = buildEntry();
  // The registry entry shape — instant_refresh and tags omitted when empty for tidier preview.
  const out = {
    id: e.id || "<owner>/<repo>",
    description: e.description || "<one-line description>",
    format: e.format || "<format>",
    graph_url: e.graph_url || "<https://...>",
  };
  if (e.tags.length) out.tags = e.tags;
  if (e.instant_refresh) out.instant_refresh = true;
  $previewCode.textContent = JSON.stringify(out, null, 2);
}

// ---------- Submit ----------
$form.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!validate()) return;
  const url = buildIssueUrl();
  window.open(url, "_blank", "noopener");
});

// ---------- Copy as JSON ----------
$copy.addEventListener("click", async () => {
  const e = buildEntry();
  const out = { id: e.id, description: e.description, format: e.format, graph_url: e.graph_url };
  if (e.tags.length) out.tags = e.tags;
  if (e.instant_refresh) out.instant_refresh = true;
  const text = JSON.stringify(out, null, 2);
  try {
    await navigator.clipboard.writeText(text);
    $copyStatus.textContent = "Copied. Paste into registry.json in a PR.";
    $copyStatus.classList.remove("error");
    $copyStatus.hidden = false;
  } catch {
    // Fallback: select textarea trick
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { ok = false; }
    ta.remove();
    if (ok) {
      $copyStatus.textContent = "Copied. Paste into registry.json in a PR.";
      $copyStatus.classList.remove("error");
    } else {
      $copyStatus.textContent = "Couldn't copy — select the JSON Preview text instead.";
      $copyStatus.classList.add("error");
    }
    $copyStatus.hidden = false;
  }
});

// ---------- Preview toggle ----------
$togglePreview.addEventListener("click", () => {
  const expanded = $togglePreview.getAttribute("aria-expanded") === "true";
  $togglePreview.setAttribute("aria-expanded", String(!expanded));
  $preview.hidden = expanded;
  $togglePreview.textContent = expanded ? "Preview JSON ↓" : "Hide JSON ↑";
});

// ---------- Wire up live updates ----------
function onAnyChange() {
  validate();
  updatePreview();
}

$id.addEventListener("input", () => {
  maybeSuggestUrl();
  onAnyChange();
});
$url.addEventListener("input", onAnyChange);
$desc.addEventListener("input", () => {
  updateDescCount();
  onAnyChange();
});
$refresh.addEventListener("change", onAnyChange);

document.querySelectorAll('input[name="format"]').forEach(r => {
  r.addEventListener("change", () => {
    maybeSuggestUrl();
    onAnyChange();
  });
});

// ---------- Init ----------
updateDescCount();
validate();
updatePreview();
