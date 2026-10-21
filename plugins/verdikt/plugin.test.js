// The plugin ships one skill through three manifest formats and two
// marketplaces. Nothing builds them, so this is what keeps them in step.

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const PLUGIN = import.meta.dirname;
const ROOT = resolve(PLUGIN, '../..');
const read = (/** @type {string} */ path) => JSON.parse(readFileSync(path, 'utf8'));

const manifests = {
  cursor: read(resolve(PLUGIN, '.cursor-plugin/plugin.json')),
  claude: read(resolve(PLUGIN, '.claude-plugin/plugin.json')),
  codex: read(resolve(PLUGIN, '.codex-plugin/plugin.json'))
};
const marketplaces = {
  cursor: read(resolve(ROOT, '.cursor-plugin/marketplace.json')),
  claude: read(resolve(ROOT, '.claude-plugin/marketplace.json'))
};
const ENDPOINT = 'https://mcp.verdikt.bond';
const claudeMcp = read(resolve(PLUGIN, '.mcp.json'));
const sharedMcp = read(resolve(PLUGIN, 'mcp.json'));
const registry = read(resolve(ROOT, 'server.json'));
const skill = readFileSync(resolve(PLUGIN, 'skills/verdikt/SKILL.md'), 'utf8');

describe('verdikt plugin', () => {
  it('names one plugin, at one version, in every manifest', () => {
    const { version } = manifests.claude;
    for (const manifest of Object.values(manifests)) {
      expect(manifest.name).toBe('verdikt');
      expect(manifest.version).toBe(version);
    }
    expect(marketplaces.cursor.metadata.version).toBe(version);
    expect(marketplaces.claude.plugins[0].version).toBe(version);
  });

  it('lists this folder in both marketplaces', () => {
    for (const marketplace of Object.values(marketplaces)) {
      const [entry] = marketplace.plugins;
      expect(entry.name).toBe('verdikt');
      expect(resolve(ROOT, entry.source)).toBe(PLUGIN);
    }
  });

  it('names only files that are here', () => {
    const paths = [
      manifests.claude.mcpServers,
      manifests.cursor.mcpServers,
      manifests.codex.mcpServers,
      manifests.cursor.skills,
      manifests.cursor.logo,
      manifests.codex.skills,
      manifests.codex.interface.logo,
      manifests.codex.interface.composerIcon
    ];
    for (const path of paths) expect(existsSync(resolve(PLUGIN, path)), path).toBe(true);
  });

  it('ships a skill named verdikt', () => {
    const frontmatter = /^---\n([\s\S]*?)\n---\n/.exec(skill)?.[1] ?? '';
    expect(frontmatter).toMatch(/^name: verdikt$/m);
    expect(frontmatter).toMatch(/^description: .+/m);
  });

  it('reads services, verdicts, refunds and status from the indexer', () => {
    const indexer = 'https://verdikt-indexer.denis-perov.workers.dev/v1';
    for (const path of ['services', 'verdicts', 'refunds', 'status']) {
      expect(skill).toContain(`${indexer}/${path}`);
    }
    // api.verdikt.bond serves no index: it is the registration service (quote, check and the paid routes), all under /v1/services/.
    expect(skill).not.toMatch(/api\.verdikt\.bond\/v1\/(?:verdicts|refunds|status|services(?!\/))/);
  });

  it('states the same deployment the scripts use', async () => {
    const { DEPLOYMENT } = await import('./skills/verdikt/scripts/deployment.js');
    for (const value of [DEPLOYMENT.registry, DEPLOYMENT.vault, DEPLOYMENT.usdc, DEPLOYMENT.rpcUrl, String(DEPLOYMENT.chainId)]) {
      expect(skill, value).toContain(value);
    }
  });

  it('ships every script the skill names', () => {
    const named = [...skill.matchAll(/scripts\/([\w-]+\.mjs)/g)].map(([, file]) => file);
    expect(named.length).toBeGreaterThan(0);
    for (const file of new Set(named)) expect(existsSync(resolve(PLUGIN, 'skills/verdikt/scripts', file)), file).toBe(true);
  });

  it('points every MCP config at the deployed endpoint', () => {
    expect(manifests.claude.mcpServers).toBe('./.mcp.json');
    expect(manifests.cursor.mcpServers).toBe('./mcp.json');
    expect(manifests.codex.mcpServers).toBe('./mcp.json');
    expect(claudeMcp.mcpServers.verdikt).toEqual({ type: 'http', url: ENDPOINT });
    expect(sharedMcp.mcpServers.verdikt).toEqual({ url: ENDPOINT });
    expect(registry.remotes).toEqual([{ type: 'streamable-http', url: ENDPOINT }]);
    expect(registry.description.length).toBeLessThanOrEqual(100); // registry schema limit
    expect(registry.version).toBe(manifests.claude.version);
  });

  it('keeps secrets and private links out of the MCP files', () => {
    const text = [claudeMcp, sharedMcp, registry].map((f) => JSON.stringify(f)).join('\n');
    expect(text).not.toMatch(/key|token|secret|authorization|headers/i);
    expect(registry.repository.url).toBe('https://github.com/verdikthq/plugins');
  });

  it('tells the skill about the tools and the payment constraints', () => {
    for (const tool of ['discover', 'call', 'verdict', 'refunds', 'claim']) expect(skill).toContain(`| \`${tool}\``);
    expect(skill).toContain(ENDPOINT);
    expect(skill).toMatch(/never pays, signs or broadcasts/);
    expect(skill).toMatch(/asynchronous/);
    expect(skill).toMatch(/bond coverage/);
    expect(skill).not.toMatch(/no Verdikt MCP server yet/);
  });
});
