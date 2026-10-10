// Verdikt's current deployment. SKILL.md states the same values in prose,
// and plugin.test.js fails when the two disagree.
export const DEPLOYMENT = Object.freeze({
  network: 'Base',
  caip2: 'eip155:8453',
  chainId: 8453,
  rpcUrl: 'https://mainnet.base.org',
  explorer: 'https://basescan.org',
  registry: '0xbd4a99ae4f0534f84089de2a21edb8dbfcae0deb',
  vault: '0x5dc9d2663a0fd884d2bd55ada839e0a50fbe1cc4',
  usdc: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
  discoveryUrl: 'https://verdikt.bond'
});
