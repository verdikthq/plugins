// Verdikt's current deployment. SKILL.md states the same values in prose,
// and plugin.test.js fails when the two disagree.
export const DEPLOYMENT = Object.freeze({
  network: 'Base',
  caip2: 'eip155:8453',
  chainId: 8453,
  rpcUrl: 'https://mainnet.base.org',
  explorer: 'https://basescan.org',
  registry: '0x165311c64749d5fab9589b8dae11e501eb242c62',
  vault: '0xabd7f415357a0e56ac3c811654f1b1c2aa77f436',
  usdc: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
  discoveryUrl: 'https://verdikt.bond'
});
