# Indexed-by badge — embed in your README

If your repo is in the registry, advertise it. The badge below is a
shields.io-rendered SVG; copy/paste the markdown into your README.

## Markdown

```markdown
[![Indexed by understand-quickly](https://img.shields.io/badge/Indexed_by-understand--quickly-1f6feb?labelColor=0a0a0a)](https://looptech-ai.github.io/understand-quickly/?id=YOUR_OWNER/YOUR_REPO)
```

Replace `YOUR_OWNER/YOUR_REPO` with your registry id (the `id` field in
`registry.json`). Clicking the badge takes the visitor straight to your
entry's detail panel on the registry site.

## HTML

```html
<a href="https://looptech-ai.github.io/understand-quickly/?id=YOUR_OWNER/YOUR_REPO">
  <img src="https://img.shields.io/badge/Indexed_by-understand--quickly-1f6feb?labelColor=0a0a0a"
       alt="Indexed by understand-quickly"
       height="20">
</a>
```

## Self-hosted SVG (no shields.io dependency)

If you'd rather avoid the third-party CDN, use the static SVG served from
the registry:

```markdown
[![Indexed by understand-quickly](https://looptech-ai.github.io/understand-quickly/badge.svg)](https://looptech-ai.github.io/understand-quickly/?id=YOUR_OWNER/YOUR_REPO)
```

## Status-aware badge (advanced)

To reflect drift state automatically, render against the registry's
[`registry.json`](https://looptech-ai.github.io/understand-quickly/registry.json)
in your CI:

```bash
STATUS=$(curl -fsSL https://looptech-ai.github.io/understand-quickly/registry.json \
  | jq -r --arg id "$GITHUB_REPOSITORY" '.entries[] | select(.id == $id) | .status')
case "$STATUS" in
  ok) BADGE="https://img.shields.io/badge/understand--quickly-up_to_date-brightgreen" ;;
  *)  BADGE="https://img.shields.io/badge/understand--quickly-${STATUS:-unregistered}-orange" ;;
esac
```

Drop the resolved URL into your README at build time.

---

Questions or non-default styling? Open a discussion on
[`looptech-ai/understand-quickly`](https://github.com/looptech-ai/understand-quickly/discussions).
