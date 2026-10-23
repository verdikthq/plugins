// Verdikt's current deployment. SKILL.md states the same values in prose,
// and plugin.test.js fails when the two disagree.
export const DEPLOYMENT = Object.freeze({
  network: 'Base',
  caip2: 'eip155:8453',
  chainId: 8453,
  rpcUrl: 'https://mainnet.base.org',
  explorer: 'https://basescan.org',
  registry: '0x67ab30123b6b3898d4c57cc8c008097af92f5f28',
  vault: '0x3248bfc9888906b0cbeb9a2d8c836eccfc7f1fba',
  usdc: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
  discoveryUrl: 'https://verdikt.bond'
});
