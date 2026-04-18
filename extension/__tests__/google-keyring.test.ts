import crypto from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  GOG_DEFAULT_CLIENT,
  argsWithClient,
  resolveGoogleClientName,
} from '../google/keyring';

describe('google keyring helpers', () => {
  it('uses the default client bucket for the default profile root', () => {
    expect(resolveGoogleClientName({
      fixedRoot: '/profiles/default',
      seroHome: '/profiles/default',
      agentDir: '/profiles/default/agent',
      activeProfileId: 'ignored',
    })).toBe(GOG_DEFAULT_CLIENT);
  });

  it('uses the active profile id for non-default profile buckets', () => {
    expect(resolveGoogleClientName({
      fixedRoot: '/profiles/default',
      seroHome: '/profiles/work',
      agentDir: '/profiles/work/agent',
      activeProfileId: 'Work.Profile',
    })).toBe('profile-work-profile');
  });

  it('falls back to a stable agent-dir hash when no active profile id is available', () => {
    const agentDir = '/profiles/research/agent';
    const expectedHash = crypto.createHash('sha1').update(agentDir).digest('hex').slice(0, 12);

    expect(resolveGoogleClientName({
      fixedRoot: '/profiles/default',
      seroHome: '/profiles/research',
      agentDir,
      activeProfileId: null,
    })).toBe(`profile-${expectedHash}`);
  });

  it('prefixes gog arguments with the selected client bucket', () => {
    expect(argsWithClient('profile-work', ['auth', 'status'])).toEqual([
      '--client',
      'profile-work',
      'auth',
      'status',
    ]);
  });
});
