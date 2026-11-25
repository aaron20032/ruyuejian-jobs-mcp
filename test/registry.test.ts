import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const server = JSON.parse(readFileSync(new URL('../server.json', import.meta.url), 'utf8'));

describe('official registry metadata', () => {
  it('keeps package ownership, versions and npm installation metadata aligned', () => {
    expect(server.name).toBe('com.ruyuejian/ruyuejian-jobs-mcp');
    expect(packageJson.mcpName).toBe(server.name);
    expect(server.version).toBe(packageJson.version);
    expect(server.packages[0]).toMatchObject({
      registryType: 'npm', identifier: packageJson.name, version: packageJson.version, transport: { type: 'stdio' },
    });
    expect(server.description.length).toBeLessThanOrEqual(100);
    expect(server.packages[0].environmentVariables).toBeUndefined();
  });

  it('declares the remote Streamable HTTP endpoint as the primary transport', () => {
    expect(Array.isArray(server.remotes)).toBe(true);
    expect(server.remotes[0]).toMatchObject({ type: 'streamable-http', url: 'https://www.ruyuejian.com/api/mcp' });
    // stdio stays available as the local fallback package.
    expect(server.packages[0].transport).toMatchObject({ type: 'stdio' });
  });
});
