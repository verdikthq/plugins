#!/usr/bin/env node
// Read, and claim, the refund Verdikt owes a payer.
//
//   node claim-refund.mjs --network <caip2> --payer <address|pubkey>
//       Prints what is owed. Needs no key.
//
//   node claim-refund.mjs --network <caip2> --key ed25519|p256 [--prehash] --recipient <0x…>
//       Signs a claim with the key that paid (PAYER_SECRET_KEY, 32 bytes hex)
//       and relays it from any key with Base gas (RELAYER_PRIVATE_KEY).
//       ed25519: a Solana payer. p256: a Tempo passkey account.
//
// An EVM payer with Base gas doesn't need this: it calls withdraw(payerChain)
// on the vault itself. Asks before sending anything. BASE_RPC_URL overrides
// the public RPC.

import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import { ed25519 } from '@noble/curves/ed25519';
import { p256 } from '@noble/curves/p256';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, getAddress, hexToBytes, numberToHex, parseAbi, slice } from 'viem';
import { publicKeyToAddress } from 'viem/accounts';
import { DEPLOYMENT } from './deployment.js';
import { confirm, payerBytes, payerChainOf, publicClient, walletFromEnv } from './lib.js';

const vaultAbi = parseAbi([
  'struct Claim { bytes32 payerChain; address recipient; uint256 amount; uint256 validBefore; bytes32 nonce; }',
  'function getOwed(bytes32 payerChain, bytes32 payer) view returns (uint256)',
  'function claimDigest(bytes32 payerChain, address recipient, uint256 amount, uint256 validBefore, bytes32 nonce) view returns (bytes32)',
  'function withdrawWithEd25519(bytes32 payer, Claim claim, bytes signature) returns (uint256)',
  'function withdrawWithP256(bytes32 x, bytes32 y, bool prehash, Claim claim, bytes32 r, bytes32 s) returns (uint256)'
]);

const { values } = parseArgs({
  options: {
    network: { type: 'string' },
    payer: { type: 'string' },
    key: { type: 'string' },
    prehash: { type: 'boolean', default: false },
    recipient: { type: 'string' }
  }
});
const usage = 'usage: --network <caip2> (--payer <id> | --key ed25519|p256 [--prehash] --recipient <0x…>)';
if (!values.network || !(values.payer || values.key)) throw new Error(usage);

const vault = /** @type {`0x${string}`} */ (DEPLOYMENT.vault);
const payerChain = payerChainOf(values.network);
const reader = publicClient();
const owedTo = (/** @type {`0x${string}`} */ payer) => reader.readContract({ address: vault, abi: vaultAbi, functionName: 'getOwed', args: [payerChain, payer] });
const usdc = (/** @type {bigint} */ amount) => `${(Number(amount) / 1e6).toFixed(6)} USDC`;

if (!values.key) {
  const payer = /** @type {`0x${string}`} */ (payerBytes(values.network, values.payer));
  console.log(`owed on ${values.network} to ${values.payer}: ${usdc(await owedTo(payer))}`);
  process.exit(0);
}

if (!values.recipient) throw new Error(usage);
const secretHex = process.env.PAYER_SECRET_KEY;
if (!secretHex) throw new Error('PAYER_SECRET_KEY is not set: the 32-byte key that paid, in hex');
const secret = hexToBytes(/** @type {`0x${string}`} */ (secretHex.startsWith('0x') ? secretHex : `0x${secretHex}`));
if (secret.length !== 32) throw new Error('PAYER_SECRET_KEY must be 32 bytes');

/** The payer the vault books to, and how to sign a digest for it. */
let signer;
if (values.key === 'ed25519') {
  const payer = bytesToHex(ed25519.getPublicKey(secret));
  signer = {
    payer,
    submit: (relayer, claim, digest) =>
      relayer.writeContract({ address: vault, abi: vaultAbi, functionName: 'withdrawWithEd25519', args: [payer, claim, bytesToHex(ed25519.sign(hexToBytes(digest), secret))] })
  };
} else if (values.key === 'p256') {
  const publicKey = bytesToHex(p256.getPublicKey(secret, false)); // 0x04 ‖ x ‖ y
  const x = slice(publicKey, 1, 33);
  const y = slice(publicKey, 33, 65);
  signer = {
    // A Tempo passkey account's address is the Ethereum derivation over x ‖ y.
    payer: payerBytes(values.network, publicKeyToAddress(publicKey)),
    submit: (relayer, claim, digest) => {
      const message = values.prehash ? sha256(hexToBytes(digest)) : hexToBytes(digest);
      const signature = p256.sign(message, secret, { lowS: true, prehash: false });
      return relayer.writeContract({
        address: vault,
        abi: vaultAbi,
        functionName: 'withdrawWithP256',
        args: [x, y, values.prehash, claim, numberToHex(signature.r, { size: 32 }), numberToHex(signature.s, { size: 32 })]
      });
    }
  };
} else throw new Error(usage);

const owed = await owedTo(/** @type {`0x${string}`} */ (signer.payer));
console.log(`owed on ${values.network} to ${signer.payer}: ${usdc(owed)}`);
if (owed === 0n) process.exit(0);

const relayer = walletFromEnv('RELAYER_PRIVATE_KEY');
const claim = {
  payerChain,
  recipient: getAddress(values.recipient),
  amount: owed,
  validBefore: BigInt(Math.floor(Date.now() / 1000) + 3600),
  nonce: bytesToHex(randomBytes(32))
};
if (!(await confirm(`Claim ${usdc(owed)} to ${claim.recipient} on ${DEPLOYMENT.network}, relayed by ${relayer.account.address}?`))) {
  console.log('nothing sent');
  process.exit(0);
}
// The vault computes the digest it will check, so this signs exactly that.
const digest = await reader.readContract({ address: vault, abi: vaultAbi, functionName: 'claimDigest', args: [claim.payerChain, claim.recipient, claim.amount, claim.validBefore, claim.nonce] });
const hash = await signer.submit(relayer, claim, digest);
const receipt = await relayer.waitForTransactionReceipt({ hash });
// A claim can go stale between reading what is owed and mining; a reverted
// receipt means no USDC moved.
if (receipt.status !== 'success') {
  console.error(`claim reverted: ${DEPLOYMENT.explorer}/tx/${hash}`);
  process.exit(1);
}
console.log(`claimed ${usdc(owed)} to ${claim.recipient}: ${DEPLOYMENT.explorer}/tx/${hash}`);
