#!/usr/bin/env node
// Put a provider's existing x402 or MPP API behind Verdikt.
//
//   node register-service.mjs <base URL> [--bond <USDC>] [--slug <slug>]
//     [--exclude "<METHOD> <path>"]... [--accept-fee] [--dry-run] [--one-shot]
//
// Verdikt's discovery drafts an SLA, a free slug and a description from the
// API's OpenAPI document and live 402s, in parts: it lists every operation the
// API publishes, drafts each one separately (a few at a time), then assembles
// them. Every paid route is covered unless left out with --exclude (repeatable,
// e.g. "POST /search"; for routes that are also served on a network where calls
// can't be refunded). Routes left out, or that could not be drafted, are printed
// with the draft. --one-shot asks for the older single draft instead, which
// covers only a handful of routes. The draft is printed, and nothing is
// sent until it is confirmed: every clause is a promise the bond is docked
// for, with no appeal. --bond is the USDC posted to refund FAILs from (any
// amount, default 0: without a bond, calls are still judged and scored but
// nothing is refunded). Registering pins the SLA on IPFS through discovery,
// which answers its hash and CID, then sends one USDC approve on the vault for
// the bond (skipped when the bond is 0 or already allowed) and one register of
// that hash and CID on the registry, from PROVIDER_PRIVATE_KEY, which needs
// Base gas and the bond in USDC and becomes the service's owner. BASE_RPC_URL
// overrides the public RPC.
//
// A slug of 6 or more characters registers for gas alone. A shorter one costs
// a one-time, non-refundable fee in USDC, sent to Verdikt's treasury: 1000,
// 350, 100 or 10 for 2, 3, 4 or 5 characters. The fee is read off the registry
// (`slugFeeFor`), printed before anything is sent, approved on the vault
// together with the bond, and paid only with --accept-fee.

import { parseArgs } from 'node:util';
import { formatUnits, keccak256, parseAbi, parseUnits, toBytes } from 'viem';
import { DEPLOYMENT } from './deployment.js';
import { confirm, walletFromEnv } from './lib.js';

const registryAbi = parseAbi([
  'function register(string slug, string url, bytes32 slaHash, string slaCid, string description, uint256 bond) returns (bytes32)',
  'function TREASURY() view returns (address)',
  'function slugFeeFor(address account, uint256 length) view returns (uint256)'
]);

/**
 * What `register` of `slug` charges `account` beyond gas, in USDC minor units.
 * A registry without `TREASURY` predates the slug fee and charges nothing.
 */
async function slugFee(client, registry, account, slug) {
  try {
    await client.readContract({ address: registry, abi: registryAbi, functionName: 'TREASURY' });
  } catch {
    return 0n;
  }
  return client.readContract({ address: registry, abi: registryAbi, functionName: 'slugFeeFor', args: [account, BigInt(slug.length)] });
}
const erc20Abi = parseAbi([
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)'
]);

/** POSTs JSON to a discovery endpoint and answers its JSON body. */
async function discovery(path, body) {
  const response = await fetch(`${DEPLOYMENT.discoveryUrl}/discovery/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  const answer = await response.json().catch(() => ({}));
  if (!response.ok || answer.error) throw new Error(answer.detail ?? answer.error ?? `discovery answered ${response.status}`);
  return answer;
}

const DRAFT_CONCURRENCY = 8;

/**
 * Drafts an SLA in parts: lists the API's operations, drafts each judged one
 * (minus `excluded`) and assembles them. What was left out, or could not be
 * drafted, is named in the draft's `leftOut`.
 */
async function draftSlaByRoute(url, excluded) {
  const plan = await discovery('sla/plan', { url });
  const key = (/** @type {{method: string, path: string}} */ { method, path }) => `${method} ${path}`;
  const known = new Set(plan.operations.map(key));
  for (const route of excluded) if (!known.has(route)) throw new Error(`--exclude ${route}: the API publishes no such operation (it publishes ${[...known].join(', ')})`);
  const leftOut = [
    ...plan.operations.filter((op) => excluded.has(key(op))).map((op) => ({ route: key(op), reason: 'left out by the provider' })),
    ...(plan.listedRefused ?? []).map(({ route, reason }) => ({ route, reason: `not drafted: ${reason}` }))
  ];
  const chosen = plan.operations.filter((op) => op.judged !== false && !excluded.has(key(op)));
  console.log(`  ${plan.operations.length} operations published; drafting ${chosen.length}`);
  const routes = new Array(chosen.length).fill(null);
  const inferred = [];
  let next = 0;
  const worker = async () => {
    while (next < chosen.length) {
      const i = next++;
      try {
        const { route, inferred: why } = await discovery('sla/route', { url, route: { method: chosen[i].method, path: chosen[i].path } });
        routes[i] = route;
        inferred.push(...(why ?? []));
      } catch (error) {
        leftOut.push({ route: key(chosen[i]), reason: `could not be drafted: ${error instanceof Error ? error.message : error}` });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(DRAFT_CONCURRENCY, chosen.length) }, worker));
  const drafted = routes.filter(Boolean);
  if (!drafted.length) throw new Error('no route could be drafted');
  return discovery('sla/assemble', { url, routes: drafted, inferred, leftOut });
}

/** Reads discovery's NDJSON stream to its one `draft` (or `error`) line: the older one-shot draft. */
async function draftSla(url) {
  const response = await fetch(`${DEPLOYMENT.discoveryUrl}/discovery/sla`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url })
  });
  if (!response.ok || !response.body) throw new Error(`discovery answered ${response.status}: ${await response.text()}`);
  let draft = null;
  const read = (line) => {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (event.type === 'status') console.log(`  ${event.message}`);
    else if (event.type === 'error') throw new Error(`discovery could not draft an SLA: ${event.error}`);
    else if (event.type === 'draft') draft = event.draft;
  };
  const decoder = new TextDecoder();
  let buffered = '';
  for await (const chunk of response.body) {
    buffered += decoder.decode(chunk, { stream: true });
    const lines = buffered.split('\n');
    buffered = lines.pop() ?? '';
    lines.forEach(read);
  }
  read(buffered);
  if (!draft) throw new Error('the discovery stream ended without a draft');
  return draft;
}

/**
 * Pins the SLA on IPFS through discovery and answers what `register` commits
 * to. The registry stores only the hash, so the hash discovery answers must be
 * of exactly the text shown to the user.
 */
async function pinSla(sla) {
  const response = await fetch(`${DEPLOYMENT.discoveryUrl}/discovery/sla/pin`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sla })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`discovery could not pin the SLA (${response.status}): ${body.detail ?? body.error ?? 'no detail'}`);
  if (body.slaHash !== keccak256(toBytes(sla)) || typeof body.slaCid !== 'string' || !body.slaCid) {
    throw new Error('discovery pinned something other than the SLA shown; nothing was sent');
  }
  return { slaHash: body.slaHash, slaCid: body.slaCid };
}

const { values, positionals } = parseArgs({ allowPositionals: true, options: { slug: { type: 'string' }, exclude: { type: 'string', multiple: true, default: [] }, 'one-shot': { type: 'boolean', default: false }, bond: { type: 'string', default: '0' }, 'accept-fee': { type: 'boolean', default: false }, 'dry-run': { type: 'boolean', default: false } } });
const [url] = positionals;
if (!url) throw new Error('usage: node register-service.mjs <base URL> [--bond <USDC>] [--slug <slug>] [--exclude "<METHOD> <path>"]... [--accept-fee] [--dry-run] [--one-shot]');
const bond = parseUnits(values.bond, 6);

console.log(`drafting an SLA for ${url}`);
if (values['one-shot'] && values.exclude.length) throw new Error('--exclude needs the draft by route; drop --one-shot');
const draft = values['one-shot'] ? await draftSla(url) : await draftSlaByRoute(url, new Set(values.exclude.map((route) => route.trim().replace(/\s+/g, ' ').replace(/^\S+/, (m) => m.toUpperCase()))));
const slug = values.slug ?? draft.slug;
// The published schedule, for the draft; the registry's own price for the
// registering key is read again before anything is sent.
const SLUG_FEES = { 2: 1000_000000n, 3: 350_000000n, 4: 100_000000n, 5: 10_000000n };
const listedFee = SLUG_FEES[slug.length] ?? 0n;
const feeNote = listedFee > 0n ? ` (a ${slug.length}-character slug: one-time fee ${formatUnits(listedFee, 6)} USDC, non-refundable; needs --accept-fee)` : '';
console.log(`\nslug: ${slug}${feeNote}\ndescription: ${draft.description}\n\n${draft.sla}\n`);
for (const { clause, reason } of draft.inferred ?? []) console.log(`inferred ${clause}: ${reason}`);
if (draft.leftOut?.length) {
  console.log(`\nNOT covered by this SLA (${draft.leftOut.length}): calls to these routes are never judged or refunded`);
  for (const { route, reason } of draft.leftOut) console.log(`  ${route}: ${reason}`);
}
if (draft.jevNote) console.log(`\n${draft.jevNote}\n`);
if (values['dry-run']) process.exit(0);

const client = walletFromEnv('PROVIDER_PRIVATE_KEY');
const registry = /** @type {`0x${string}`} */ (DEPLOYMENT.registry);
const fee = await slugFee(client, registry, client.account.address, slug);
if (fee > 0n && !values['accept-fee']) {
  throw new Error(`${slug} costs a one-time slug fee of ${formatUnits(fee, 6)} USDC, sent to Verdikt's treasury and never refunded. Nothing was sent; pass --accept-fee to pay it, or --slug a name of 6 or more characters.`);
}
const bondText = bond === 0n ? 'no bond (calls are judged, nothing is refunded)' : `a ${values.bond} USDC bond`;
const feeText = fee > 0n ? `, paying a one-time ${formatUnits(fee, 6)} USDC slug fee` : '';
if (!(await confirm(`Register ${slug} on ${DEPLOYMENT.network} as ${client.account.address}, with ${bondText}${feeText}?`))) {
  console.log('nothing sent');
  process.exit(0);
}

const { slaHash, slaCid } = await pinSla(draft.sla);
console.log(`SLA pinned at ipfs://${slaCid}`);
const usdc = /** @type {`0x${string}`} */ (DEPLOYMENT.usdc);
const vault = /** @type {`0x${string}`} */ (DEPLOYMENT.vault);
// One allowance on the vault covers the fee and the bond: the vault pulls both.
const pulled = fee + bond;
const allowance = pulled === 0n ? 0n : await client.readContract({ address: usdc, abi: erc20Abi, functionName: 'allowance', args: [client.account.address, vault] });
if (pulled > 0n && allowance < pulled) {
  const hash = await client.writeContract({ address: usdc, abi: erc20Abi, functionName: 'approve', args: [vault, pulled] });
  // register is simulated against the allowance, so wait for it to be mined.
  if ((await client.waitForTransactionReceipt({ hash })).status !== 'success') throw new Error(`approve reverted: ${DEPLOYMENT.explorer}/tx/${hash}`);
}
const hash = await client.writeContract({ address: registry, abi: registryAbi, functionName: 'register', args: [slug, url, slaHash, slaCid, draft.description ?? '', bond] });
if ((await client.waitForTransactionReceipt({ hash })).status !== 'success') throw new Error(`register reverted: ${DEPLOYMENT.explorer}/tx/${hash}`);
console.log(`registered: https://${slug}.verdikt.bond (${DEPLOYMENT.explorer}/tx/${hash})`);
