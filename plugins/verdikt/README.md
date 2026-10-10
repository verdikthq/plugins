# Verdikt agent plugin

One skill, [`skills/verdikt/SKILL.md`](skills/verdikt/SKILL.md), shipped
through three plugin formats that all read this folder:

| Format | Manifest | Listed by |
|---|---|---|
| Cursor (and Grok Bot, which installs from the Cursor Marketplace) | [`.cursor-plugin/plugin.json`](.cursor-plugin/plugin.json) | [`/.cursor-plugin/marketplace.json`](../../.cursor-plugin/marketplace.json) |
| Claude Code | [`.claude-plugin/plugin.json`](.claude-plugin/plugin.json) | [`/.claude-plugin/marketplace.json`](../../.claude-plugin/marketplace.json): `/plugin marketplace add verdikthq/plugins` |
| Codex | [`.codex-plugin/plugin.json`](.codex-plugin/plugin.json) | — |

There is one copy of the skill, so the formats cannot drift apart. The
manifests' versions must agree; `plugins/verdikt/plugin.test.js` fails when they
do not, or when a manifest names a file that is not here.

## What the skill relies on

Everything the skill tells an agent to read is live HTTP served by Verdikt
and its indexer, never by this repository:

- `https://verdikt.bond/llms.txt`, `https://<slug>.verdikt.bond/llms.txt` and
  `https://<slug>.verdikt.bond/.well-known/x402`. The global `llms.txt` is also
  the install prompt (`set up verdikt - https://verdikt.bond/llms.txt`), so it
  and the skill must say the same things: the skill treats the live guide as
  authoritative.
- `https://verdikt-indexer.denis-perov.workers.dev/v1/*`: services, verdicts,
  refunds and index status, served free and read-only by Verdikt's indexer. It
  is not a Verdikt service: `api.verdikt.bond` is reserved for Verdikt's own
  paid endpoints and does not serve the index.
- The vault and registry on Base Sepolia, read and called directly. Their
  addresses are written into the skill and change when Verdikt redeploys, so
  update them together with the deployment.

No secrets or keys belong in this folder, and no account-specific URL other
than the indexer's.

## Later: an MCP server

Not in v1. A remote MCP server would wrap the same HTTP surface as tools:
`discover` (the catalog and a service's `llms.txt`), `call` (through a payer
the user configures; Verdikt itself would still hold no wallet), `verdict`,
`refunds` and `claim`. When it exists, add `"mcpServers": "./mcp.json"` to the
Cursor and Codex manifests and an `.mcp.json` for Claude Code.
