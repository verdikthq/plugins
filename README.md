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
| Any other agent | Prompt it with `set up verdikt - https://verdikt.bond/llms.txt` |

To pay for calls, the agent needs an x402 or MPP payer of its own, for example
[Circle Agent Wallet](https://developers.circle.com/agent-stack),
[pay.sh](https://pay.sh/docs/get-started/install) or the
[Tempo CLI](https://tempo.xyz/developers/docs/cli). Verdikt currently runs on
testnets (Base Sepolia, Tempo Moderato, Solana devnet).

## Layout

```
.claude-plugin/marketplace.json   Claude Code marketplace listing
.cursor-plugin/marketplace.json   Cursor marketplace listing
plugins/verdikt/                  the Verdikt plugin
  skills/verdikt/SKILL.md         the one skill every format ships
  .claude-plugin/plugin.json      Claude Code manifest
  .cursor-plugin/plugin.json      Cursor manifest
  .codex-plugin/plugin.json       Codex manifest
  assets/                         logo
  plugin.test.js                  keeps the manifests and listings in step
```

There is one copy of the skill, so the formats can't drift apart. See
[`plugins/verdikt/README.md`](plugins/verdikt/README.md) for what the skill
relies on and what's planned (an MCP server).

## Development

```
npm install
npm test
```

The test fails when the manifests disagree on name or version, when a manifest
names a file that isn't here, or when the skill points at anything private.

## License

[MIT](LICENSE)
