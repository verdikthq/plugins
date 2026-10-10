// The little the two scripts share: the chain, a wallet client, and reading
// payer ids. Kept to viem so the scripts install with one small dependency set.
import { createPublicClient, createWalletClient, defineChain, http, isAddress, keccak256, pad, publicActions, toBytes, toHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { DEPLOYMENT } from './deployment.js';

export const chain = defineChain({
  id: DEPLOYMENT.chainId,
  name: DEPLOYMENT.network,
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [DEPLOYMENT.rpcUrl] } }
});

const transport = () => http(process.env.BASE_RPC_URL || DEPLOYMENT.rpcUrl);

export const publicClient = () => createPublicClient({ chain, transport: transport() });

/** A Base wallet from a hex private key held in the named environment variable. */
export function walletFromEnv(name) {
  const key = process.env[name];
  if (!key) throw new Error(`${name} is not set`);
  return createWalletClient({ account: privateKeyToAccount(/** @type {`0x${string}`} */ (key.startsWith('0x') ? key : `0x${key}`)), chain, transport: transport() }).extend(publicActions);
}

/** The vault's key for the network a call was paid on: keccak256 of its CAIP-2 id. */
export const payerChainOf = (caip2) => keccak256(toBytes(caip2));

const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** Decodes a base58 string (a Solana public key) to bytes. */
export function base58Decode(text) {
  let value = 0n;
  for (const char of text) {
    const digit = BASE58.indexOf(char);
    if (digit < 0) throw new Error(`"${text}" is not base58`);
    value = value * 58n + BigInt(digit);
  }
  const bytes = [];
  for (; value > 0n; value >>= 8n) bytes.unshift(Number(value & 0xffn));
  for (const char of text) {
    if (char !== '1') break;
    bytes.unshift(0);
  }
  return Uint8Array.from(bytes);
}

/**
 * The 32-byte payer the vault books a refund to: an EVM address left-padded,
 * a Solana public key's own bytes, or 32 bytes of hex as given.
 */
export function payerBytes(caip2, payer) {
  if (caip2.startsWith('eip155:') && isAddress(payer, { strict: false })) return pad(/** @type {`0x${string}`} */ (payer), { size: 32 }).toLowerCase();
  if (caip2.startsWith('solana:') && !payer.startsWith('0x')) {
    const bytes = base58Decode(payer);
    if (bytes.length !== 32) throw new Error(`"${payer}" is not a 32-byte Solana public key`);
    return toHex(bytes);
  }
  if (/^0x[0-9a-fA-F]{64}$/.test(payer)) return payer.toLowerCase();
  throw new Error(`cannot read "${payer}" as a payer on ${caip2}`);
}

/** Asks a yes/no question on the terminal; anything but "y" is no. */
export async function confirm(question) {
  const { createInterface } = await import('node:readline/promises');
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await prompt.question(`${question} [y/N] `);
  prompt.close();
  return answer.trim().toLowerCase() === 'y';
}
