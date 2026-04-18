import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  getGoogleCredentials,
  getGoogleOAuthNotConfiguredMessage,
  getGooglePluginConfigPath,
} from '../google/config';

const originalEnv = {
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
};

const tempDirs: string[] = [];

function makeAgentDir(): string {
  const agentDir = path.join(os.tmpdir(), `sero-google-config-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, 'agent');
  mkdirSync(path.join(agentDir, 'plugin-config'), { recursive: true });
  tempDirs.push(path.dirname(agentDir));
  return agentDir;
}

afterEach(() => {
  process.env.GOOGLE_CLIENT_ID = originalEnv.GOOGLE_CLIENT_ID;
  process.env.GOOGLE_CLIENT_SECRET = originalEnv.GOOGLE_CLIENT_SECRET;
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('google auth config', () => {
  it('builds profile-scoped plugin config paths and guidance copy', () => {
    expect(getGooglePluginConfigPath('/profiles/work/agent')).toBe(
      '/profiles/work/agent/plugin-config/sero-google-plugin.json',
    );
    expect(getGoogleOAuthNotConfiguredMessage('/profiles/work/agent')).toBe(
      'Google OAuth not configured. Use the setup form in the Google plugin or add credentials to /profiles/work/agent/plugin-config/sero-google-plugin.json',
    );
  });

  it('prefers plugin config values over environment fallbacks', () => {
    const agentDir = makeAgentDir();
    process.env.GOOGLE_CLIENT_ID = 'env-client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'env-client-secret';

    writeFileSync(
      getGooglePluginConfigPath(agentDir),
      JSON.stringify({ clientId: 'file-client-id', clientSecret: 'file-client-secret' }),
      'utf8',
    );

    expect(getGoogleCredentials(agentDir)).toEqual({
      clientId: 'file-client-id',
      clientSecret: 'file-client-secret',
    });
  });
});
