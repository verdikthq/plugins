// Verdikt's current deployment. SKILL.md states the same values in prose,
// and plugin.test.js fails when the two disagree.
export const DEPLOYMENT = Object.freeze({
  network: 'Base Sepolia',
  caip2: 'eip155:84532',
  chainId: 84532,
  rpcUrl: 'https://sepolia.base.org',
  explorer: 'https://sepolia.basescan.org',
  registry: '0xb532e13ce953d1fa587716ca1ef6fc7781e2e8a8',
  vault: '0x2cde82ebebcedfd30eca2703b067ce2ddf2c09fa',
  usdc: '0x036cbd53842c5426634e7929541ec2318f3dcf7e',
  discoveryUrl: 'https://verdikt.bond'
});
