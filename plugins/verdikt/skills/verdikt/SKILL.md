---
name: verdikt
description: Find, call and check paid APIs (x402 or MPP) whose every paid call is verified against the provider's SLA and refunded on chain when it fails. Use when the user wants a paid API, mentions x402, MPP, a 402 Payment Required, an SLA, a refund for a bad paid call, wants to verify a paid call or read its verdict, or wants to register my API as a provider on Verdikt (verdikt.bond).
---

# Verdikt

Verdikt is a proxy in front of x402 and MPP paid APIs. Every paid call made through `https://<slug>.verdikt.bond` is relayed to the provider unmodified, then judged against the SLA the provider published on Base: latency, response schema, price, and model-judged quality. A call that breaks the SLA is refunded on chain from the provider's bond. You pay exactly as you would pay the provider directly; nothing in the request or the response changes.

This skill is plain HTTP plus whatever payer tool you already have. **It holds no wallet and never pays.** Without a payer tool (Flow B) you can browse services and read verdicts, but not call a paid route.

The same guide, kept current with the live marketplace, is at `https://verdikt.bond/llms.txt`. Where this page and a live document disagree, the live document wins.

## Guardrails

- **Never pay, move funds or claim a refund without the user's explicit confirmation.** State the URL, the price, the network and the asset first.
- **Say which network you are on before paying.** Today Verdikt runs on testnets: refunds and verdicts on **Base Sepolia**, payments on Base Sepolia, **Tempo testnet** (Moderato) and Solana devnet. Testnet funds have no value; say so, and never send mainnet funds to a testnet service.
- **Never retry a paid call blindly.** A retry is a new payment. If a call failed, read its verdict (Flow C) instead: a failure that breaks the SLA is refunded on its own.
- Only paths an SLA route declares are judged. Calling any other path is relayed but never refunded.

## Flow A: find a service

Start from one of these, all public and unauthenticated:

| What | URL |
|---|---|
| Verdikt's own guide, with every listed service | `GET https://verdikt.bond/llms.txt` |
| One service's guide: **read this first for a single service** | `GET https://<slug>.verdikt.bond/llms.txt` |
| RFC 9727 catalog: one entry per service, with `service-desc` (OpenAPI), `service-doc` (human page) and `status` | `GET https://verdikt.bond/.well-known/api-catalog` |
| x402 Bazaar-shaped directory, one item per paid route, with x402 v2 `accepts` | `GET https://verdikt.bond/discovery/resources` (`?slug=<slug>` for one service) |
| A service's routes, prices, request bodies and SLA clauses | `GET https://<slug>.verdikt.bond/openapi.json` |
| A service's paid URLs by protocol: `resources` (x402), `mppResources` (MPP), plus `instructions` | `GET https://<slug>.verdikt.bond/.well-known/x402` |
| Human page for a service | `https://verdikt.bond/services/<slug>` |

The per-service `llms.txt` lists one line per SLA route: method and URL, the live price, each payment option with whether it is refundable, a summary of what the call is judged on, and the route's record. It also repeats the 402 → pay → retry flow.

### Reading the SLA

Each operation in `openapi.json` carries the route's SLA clauses under `x-verdikt`, and `x-verdikt.judged: false` marks a listed-only route (free or sign-in-only): proxied, never judged, never refunded. The clause types:

- `latency`: the response must arrive within `maxMs`, measured at the proxy.
- `schema`: the response body must match a JSON Schema. If the clause has an `inputSchema` and your request does not match it, the clause is **skipped**, not failed: a malformed request is never refunded.
- `priceRange`: the provider must charge between `minMinorUnits` and `maxMinorUnits` of the asset.
- `noul`, `score`, `choice`, `composite`: quality questions answered by a model (Jev) about the response. They can only turn a PASS into a FAIL, and are skipped when the model is unsure.
- `delivery` is implicit on every judged route: a 5xx or no answer at all fails it.

A 4xx is not judged when the SLA cannot be read, and a 402 is never judged: the provider was not paid.

### Reading a service's record

- `conformance`: share of judged calls that met the SLA. `availability`: share that got an answer at all. Both 0–1000 over a trailing window; a service with no judged calls yet reads 1000, so check how many verdicts stand behind it.
- `bond` (or `deposit`): what is left to refund from, in USDC minor units (6 decimals).
- `status`: `ACTIVE` routes calls. `SUSPENDED` has a drained bond and routes nothing until topped up.

### Refund rule

A FAIL or DOWN is refunded **only** for calls paid in USDC or USDC.e (or each testnet's stand-in, such as pathUSD on Tempo testnet), in USDC on Base, **to the key that paid**. The refund is the smallest of three amounts: the registry's fixed refund (`FIXED_REFUND`, 1 USDC by default; read it with `cast call <registry> "FIXED_REFUND()(uint256)" --rpc-url https://sepolia.base.org`), what you paid, and what is left of the provider's bond. A call that cost more than the fixed refund is only partly refunded. A call paid any other way is still judged and scored, and refunded nothing. The `llms.txt` line `(refundable)` / `(not refundable)` says which payment options qualify.

## Flow B: call a service

The proxy relays the provider's own `402` challenge and the provider's response unchanged; it only rewrites x402's `resource.url` to name the Verdikt URL you called. So any x402 or MPP payer works:

1. Call `https://<slug>.verdikt.bond/<path>` unpaid. You get the provider's `402`: x402 in the `PAYMENT-REQUIRED` header or the body, MPP in `WWW-Authenticate: Payment`.
2. Pay it with your payer tool, which retries with `PAYMENT-SIGNATURE` (x402 v2), `X-PAYMENT` (x402 v1) or `Authorization: Payment …` (MPP).
3. The response is the provider's. The verdict is **not** in it; read it later (Flow C).

Pick the payer from `/.well-known/x402`: a URL under `resources` takes x402 (Circle Agent Wallet, pay.sh), one under `mppResources` takes MPP (Tempo CLI for MPP on Tempo, pay.sh for MPP on Solana). A URL can be under both.

Each tool below has its own agent setup. Install it only with the user's consent, and confirm its exact flags with its `--help` before the first paid call: these tools change faster than this page.

### Circle Agent Wallet (x402, USDC on EVM chains)

Setup: read `https://agents.circle.com/skills/setup.md` and follow it (it installs the `circle` CLI and creates agent wallets). Docs: <https://developers.circle.com/agent-stack>. Fetch Circle's wallet-pay skill before paying, as its setup says.

```bash
circle services pay "https://demo.verdikt.bond/quote" -X POST \
  --address <your agent wallet> --chain BASE-SEPOLIA --data '{"symbol":"ETH"}'
```

`--chain` must be a chain the 402 accepts and where the wallet holds USDC.

### pay.sh (Solana Foundation `pay` CLI: x402 and MPP on Solana)

Install: <https://pay.sh/docs/get-started/install> (`npm install -g @solana/pay`), then `pay setup` to create a wallet, or `pay setup --update` to refresh agent config. `pay curl` wraps curl and answers the 402 for you; `pay --sandbox` uses sandbox funds.

```bash
pay curl -X POST -H 'content-type: application/json' -d '{"symbol":"ETH"}' https://<slug>.verdikt.bond/<path>
```

### Tempo CLI (MPP on Tempo)

Setup: `Read https://tempo.xyz/SKILL.md and set up tempo` (installs with `curl -fsSL https://tempo.xyz/install | bash`). Docs: <https://tempo.xyz/developers/docs/cli>. Preview the cost first with `--dry-run`, cap it with `--max-spend`, and use `-t` for compact output. The CLI pays on Tempo **mainnet** unless told otherwise, and refuses a challenge for another chain before paying, so a testnet service such as `demo` needs `--network testnet` (Moderato) on every command, or `TEMPO_WALLET_NETWORK` set to it.

```bash
tempo request -t --network testnet --dry-run -X POST --json '{"symbol":"ETH"}' https://demo.verdikt.bond/malformed
tempo request -t --network testnet --max-spend 0.01 -X POST --json '{"symbol":"ETH"}' https://demo.verdikt.bond/malformed
```

### Try it: the `demo` service

`demo` is a mock price API whose routes break its SLA on purpose, 0.001 USDC (or pathUSD on Tempo testnet) a call, payable with x402 on Base Sepolia or MPP on Tempo testnet. All take `POST` with `{"symbol":"ETH"}` (BTC, ETH, SOL or USDC):

- `/quote` delivers and PASSes.
- `/slow` answers past the latency bound: FAIL `responds-within-8s`.
- `/malformed` answers with fields missing: FAIL `quote-shape`.
- `/outage` answers 503: FAIL `delivery`.

Read `https://demo.verdikt.bond/llms.txt` first; it is authoritative over this list.

## Flow C: check the verdict and the refund

Verdicts are written asynchronously, usually within a few minutes of the call. Verdikt's index of Base is itself a Verdikt service, `api`, whose free routes are listed (in its `openapi.json` and `llms.txt` like any service) but never judged and never paid:

| Endpoint | Returns |
|---|---|
| `GET https://api.verdikt.bond/v1/services` | every registered service: `serviceId`, `slug`, `provider` |
| `GET https://api.verdikt.bond/v1/verdicts?serviceId=<id>` | `outcome`, `payerChain`, `payer`, `paidAmount`, `failedClause`, `routeId`, `blockNumber`, `transactionHash` |
| `GET https://api.verdikt.bond/v1/refunds?serviceId=<id>` | `payerChain`, `payer`, `amount` credited, `transactionHash` |
| `GET https://api.verdikt.bond/v1/status` | `indexedThroughBlock`, `lastUpdated`: how fresh the index is |

`serviceId` is `keccak256` of the slug's UTF-8 bytes (`cast keccak demo`, or viem's `keccak256(toBytes('demo'))`), or read it off `/v1/services`.

Find your call by `payer` and recent `blockNumber`: the proxy never returns a request id. An EVM `payer` is the paying address left-padded to 32 bytes; a Solana one is the 32-byte owner public key. With Circle's batched Gateway payments the payer is the wallet's backing EOA, not the smart account.

Reading a verdict:

- `outcome`: `0` PASS, `1` FAIL (a response arrived and broke a clause), `2` DOWN (paid, nothing usable came back).
- `routeId`: `keccak256` of the route's id, which is its `id` if the SLA gives one, else `"METHOD /path"` (e.g. `keccak256("POST /malformed")`). Zero means the call was judged on status alone.
- `failedClause`: `keccak256` of the failing clause's `id` (e.g. `keccak256("quote-shape")`), or zero on a PASS. To name it, hash each clause id of the matched route, then the SLA's top-level `clauses` (older SLAs' defaults), and compare; `keccak256("delivery")` is the implicit delivery clause. A non-zero hash that matches nothing means the provider has edited its SLA since.
- The observed value is never on chain. The dashboard page `https://verdikt.bond/services/<slug>` shows each verdict with its clause.

### What you are owed

Refunds are booked in the `VerdiktVault` on Base, keyed by `(payerChain, payer)`: `payerChain = keccak256(<CAIP-2 network you paid on>)`, e.g. `keccak256("eip155:84532")` for Base Sepolia, `keccak256("eip155:42431")` for Tempo testnet, `keccak256("solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1")` for Solana devnet. On the current Base Sepolia deployment (chain id 84532) the vault is `0x2cde82ebebcedfd30eca2703b067ce2ddf2c09fa` and the registry `0xb532e13ce953d1fa587716ca1ef6fc7781e2e8a8`. Verdikt redeploys while it is on testnet: if a call to either reverts or returns nothing, check the addresses on <https://verdikt.bond> before trusting a zero.

```bash
cast call <vault> "getOwed(bytes32,bytes32)(uint256)" <payerChain> <payer> --rpc-url https://sepolia.base.org
```

The result is in USDC minor units (6 decimals).

### Claiming (only with the user's confirmation)

- **An EVM payer** with Base gas calls `withdraw(payerChain)` on the vault from the key that paid.
- **A Solana payer or a Tempo passkey account** has no Base account: it signs a claim with the key that paid, and any funded Base key relays it. The signature covers the recipient and amount, so the relayer can only pass it on:
  1. Build a claim `(payerChain, recipient, amount, validBefore, nonce)`: `recipient` is the Base address to pay, `amount` at most `getOwed`, `validBefore` a unix time about an hour ahead, `nonce` 32 random bytes.
  2. Get the digest to sign: `cast call <vault> "claimDigest(bytes32,address,uint256,uint256,bytes32)(bytes32)" <payerChain> <recipient> <amount> <validBefore> <nonce> --rpc-url https://sepolia.base.org`.
  3. Sign the 32-byte digest with the key that paid: ed25519 for a Solana payer, P-256 (low-s) for a Tempo passkey.
  4. Any key with Base gas submits it: `withdrawWithEd25519(bytes32 payer, (bytes32,address,uint256,uint256,bytes32) claim, bytes signature)`, where `payer` is the Solana public key's 32 bytes, or `withdrawWithP256(bytes32 x, bytes32 y, bool prehash, claim, bytes32 r, bytes32 s)` for a passkey (`prehash` when the key signed `sha256(digest)`).

  Never ask the user for a secret key in chat. Have them sign with their own wallet or tool, and only relay the signature.
- **In a browser:** <https://verdikt.bond/withdraw>.

## Flow D: register an API (providers)

A provider with an existing x402 or MPP paid API can put it behind Verdikt:

1. Draft an SLA from the API's base URL. `POST https://verdikt.bond/discovery/sla` reads the API's OpenAPI document and live 402s and streams a drafted SLA, slug and description as NDJSON.
2. **Review every clause with the user.** Each one is a promise the bond is docked for, with no appeal.
3. Post the bond and register in the web wizard at <https://verdikt.bond/provider>, with the provider's own wallet: one USDC approve on the vault, then one `register`.
4. Share `https://<slug>.verdikt.bond`: calls through it are judged, calls straight to the provider are not.

## Not yet

There is no Verdikt MCP server yet. A later one would expose `discover`, `call`, `verdict`, `refunds` and `claim` tools over the same HTTP surface; until then everything above is plain HTTP.
