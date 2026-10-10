#!/usr/bin/env node
// Put a provider's existing x402 or MPP API behind Verdikt.
//
//   node register-service.mjs <base URL> [--bond <USDC>] [--slug <slug>] [--dry-run]
//
// Verdikt's discovery drafts an SLA, a free slug and a description from the
// API's OpenAPI document and live 402s. The draft is printed, and nothing is
// sent until it is confirmed: every clause is a promise the bond is docked
// for, with no appeal. --bond is the USDC posted to refund FAILs from (any
// amount, default 0: without a bond, calls are still judged and scored but
// nothing is refunded). Registering is one USDC approve on the vault for the
// bond (skipped when the bond is 0 or already allowed) and one register on the
// registry, from PROVIDER_PRIVATE_KEY, which needs Base gas and the bond in
// USDC and becomes the service's owner. BASE_RPC_URL overrides the public RPC.

import { parseArgs } from 'node:util';
import { parseAbi, parseUnits } from 'viem';
import { DEPLOYMENT } from './deployment.js';
import { confirm, walletFromEnv } from './lib.js';

const registryAbi = parseAbi([
  'function register(string slug, string url, string sla, string description, uint256 bond) returns (bytes32)'
]);
const erc20Abi = parseAbi([
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)'
]);

/** Reads discovery's NDJSON stream to its one `draft` (or `error`) line. */
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

const { values, positionals } = parseArgs({ allowPositionals: true, options: { slug: { type: 'string' }, bond: { type: 'string', default: '0' }, 'dry-run': { type: 'boolean', default: false } } });
const [url] = positionals;
if (!url) throw new Error('usage: node register-service.mjs <base URL> [--bond <USDC>] [--slug <slug>] [--dry-run]');
const bond = parseUnits(values.bond, 6);

console.log(`drafting an SLA for ${url}`);
const draft = await draftSla(url);
const slug = values.slug ?? draft.slug;
console.log(`\nslug: ${slug}\ndescription: ${draft.description}\n\n${draft.sla}\n`);
for (const { clause, reason } of draft.inferred ?? []) console.log(`inferred ${clause}: ${reason}`);
if (draft.jevNote) console.log(`\n${draft.jevNote}\n`);
if (values['dry-run']) process.exit(0);

const client = walletFromEnv('PROVIDER_PRIVATE_KEY');
const registry = /** @type {`0x${string}`} */ (DEPLOYMENT.registry);
const bondText = bond === 0n ? 'no bond (calls are judged, nothing is refunded)' : `a ${values.bond} USDC bond`;
if (!(await confirm(`Register ${slug} on ${DEPLOYMENT.network} as ${client.account.address}, with ${bondText}?`))) {
  console.log('nothing sent');
  process.exit(0);
}

const usdc = /** @type {`0x${string}`} */ (DEPLOYMENT.usdc);
const vault = /** @type {`0x${string}`} */ (DEPLOYMENT.vault);
const allowance = bond === 0n ? 0n : await client.readContract({ address: usdc, abi: erc20Abi, functionName: 'allowance', args: [client.account.address, vault] });
if (bond > 0n && allowance < bond) {
  const hash = await client.writeContract({ address: usdc, abi: erc20Abi, functionName: 'approve', args: [vault, bond] });
  // register is simulated against the allowance, so wait for it to be mined.
  if ((await client.waitForTransactionReceipt({ hash })).status !== 'success') throw new Error(`approve reverted: ${DEPLOYMENT.explorer}/tx/${hash}`);
}
const hash = await client.writeContract({ address: registry, abi: registryAbi, functionName: 'register', args: [slug, url, draft.sla, draft.description ?? '', bond] });
if ((await client.waitForTransactionReceipt({ hash })).status !== 'success') throw new Error(`register reverted: ${DEPLOYMENT.explorer}/tx/${hash}`);
console.log(`registered: https://${slug}.verdikt.bond (${DEPLOYMENT.explorer}/tx/${hash})`);
