# Verdikt plugins

Agent plugins and skills for [Verdikt](https://verdikt.bond): paid APIs (x402
and MPP) whose every call is judged against the provider's published SLA, with
a failed call refunded from the provider's bond on Base.

The plugin teaches an agent to find Verdikt-backed services, call them through
`https://<slug>.verdikt.bond` with the payer it already has, and read each
call's verdict and refund. It holds no wallet and never pays on its own.

## Install

| Agent | How |
|---|---|
| Claude Code | `/plugin marketplace add verdikthq/plugins`, then `/plugin install verdikt@verdikt` |
| Cursor, Grok Bot | From the Cursor Marketplace once listed; until then, this repository's [`.cursor-plugin/marketplace.json`](.cursor-plugin/marketplace.json) |
| Codex | [`plugins/verdikt/.codex-plugin/plugin.json`](plugins/verdikt/.codex-plugin/plugin.json) |
| Any MCP client | Add the remote server `https://mcp.verdikt.bond/mcp` (Streamable HTTP, no API key); see [`server.json`](server.json) |
| Any other agent | Prompt it with `set up verdikt - https://verdikt.bond/llms.txt` |

## MCP server

A remote MCP server at `https://mcp.verdikt.bond/mcp` (Streamable HTTP) gives
any MCP client five typed tools without a skill: `discover`, `call`,
`verdict`, `refunds` and `claim`. Read-only tools need no authentication.

- **Verdikt holds no wallet and never pays, signs or broadcasts.** An unpaid
  `call` returns the provider's 402 challenge; the client signs the payment
  with its own wallet and retries with the signed payment header. Paid calls
  therefore need a payer of the client's own.
- **Verdicts are asynchronous.** The paid response carries no verdict; poll
  `verdict` afterwards.
- **Refunds depend on the bond.** Check a service's bond coverage with
  `discover` before paying: a FAIL may be refunded nothing if the bond is
  absent or exhausted. Refunds are owed in USDC on Base, keyed by the payer
  and the network it paid on. `claim` only prepares unsigned data; the client
  signs and submits.

To pay for calls, the agent needs an x402 or MPP payer of its own, for example
[Circle Agent Wallet](https://developers.circle.com/agent-stack),
[pay.sh](https://pay.sh/docs/get-started/install) or the
[Tempo CLI](https://tempo.xyz/developers/docs/cli). Verdikt runs on Base
mainnet: calls, bonds and refunds are real USDC.

## Layout

```
server.json                       official MCP Registry entry
.claude-plugin/marketplace.json   Claude Code marketplace listing
.cursor-plugin/marketplace.json   Cursor marketplace listing
plugins/verdikt/                  the Verdikt plugin
  skills/verdikt/SKILL.md         the one skill every format ships
  skills/verdikt/scripts/         refund claim and service registration scripts
  .mcp.json                       Claude Code MCP server config
  mcp.json                        Cursor and Codex MCP server config
  .claude-plugin/plugin.json      Claude Code manifest
  .cursor-plugin/plugin.json      Cursor manifest
  .codex-plugin/plugin.json       Codex manifest
  assets/                         logo
  plugin.test.js                  keeps the manifests and listings in step
```

There is one copy of the skill, so the formats can't drift apart. See
[`plugins/verdikt/README.md`](plugins/verdikt/README.md) for what the skill
relies on and how the MCP server fits in.

## Development

```
npm install
npm test
```

The test fails when the manifests disagree on name or version, when the MCP
files stop pointing at the same endpoint, when a manifest
names a file that isn't here, when the skill and `scripts/deployment.js` state
different addresses, or when the skill names a script that isn't shipped.

The skill's scripts install separately: `npm install` in
`plugins/verdikt/skills/verdikt/scripts`. They depend only on `viem` and
`@noble/curves` / `@noble/hashes`.

## License

[MIT](LICENSE)
