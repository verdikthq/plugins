// Verdikt's current deployment. SKILL.md states the same values in prose,
// and plugin.test.js fails when the two disagree.
export const DEPLOYMENT = Object.freeze({
  network: 'Base',
  caip2: 'eip155:8453',
  chainId: 8453,
  rpcUrl: 'https://mainnet.base.org',
  explorer: 'https://basescan.org',
  registry: '0xe182626142e63ef440421cb0c5e4debeef76e4af',
  vault: '0x2416d54590d3bf00d9f01c7f2daa4dcc35322866',
  usdc: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
  discoveryUrl: 'https://verdikt.bond'
});
