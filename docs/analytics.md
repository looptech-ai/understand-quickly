# Analytics

`understand-quickly` ships with optional Cloudflare Web Analytics in beacon
mode. It runs entirely in the visitor's browser, sets no cookies, and sends
no PII back to the project. If the deployment environment does not provide
a token the placeholder ships and the script silently no-ops on Cloudflare's
side.

## What we measure

Cloudflare's beacon collects only:

- Aggregate page views per path
- Country (IP-derived, not stored)
- Referrer
- User-agent string

We do not collect:

- Cookies of any kind
- IP addresses (Cloudflare drops them after geolocation)
- User identifiers
- Any form / interaction content

## How to set the token

1. Create a Cloudflare account (free) and add a Web Analytics site token.
2. In GitHub, open
   `Settings → Secrets and variables → Actions → New repository secret`.
3. Name it `CF_BEACON_TOKEN` and paste the token from Cloudflare.

On the next `pages` workflow run, the GitHub Action substitutes
`PLACEHOLDER_TOKEN` in `_site/index.html`, `_site/about.html`, and
`_site/add.html` with the live token before publishing.

If the secret is unset the placeholder ships unchanged and Cloudflare
returns a 4xx for the missing-token request. No data is recorded.

## Privacy posture

- GDPR-friendly: no cookies, no fingerprinting, no cross-site tracking.
- The beacon script is loaded `defer` from
  `static.cloudflareinsights.com` with `referrerpolicy="no-referrer-when-downgrade"`.
- The script is single-purpose and audited; it is the same beacon Cloudflare
  uses for every other Web Analytics customer.
- `spa: false` because the registry browser uses native page transitions
  and deeplink param mutations, not a router that swaps history entries.
