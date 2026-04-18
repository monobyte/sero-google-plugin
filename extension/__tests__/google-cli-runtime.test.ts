import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  execFile: vi.fn(),
  ensureCredentialsAvailable: vi.fn(),
  getEmail: vi.fn(() => 'user@example.com'),
  getGoogleClientName: vi.fn(() => 'profile-work'),
  deriveKeyringPassword: vi.fn(() => 'stable-password'),
  buildGogPath: vi.fn(() => '/opt/homebrew/bin:/usr/local/bin'),
  resolveGogBinaryPath: vi.fn(() => '/opt/homebrew/bin/gog'),
}));

vi.mock('node:child_process', () => ({
  execFile: mocks.execFile,
}));

vi.mock('../google/auth', () => ({
  getGoogleAuthManager: () => ({
    ensureCredentialsAvailable: mocks.ensureCredentialsAvailable,
    getEmail: mocks.getEmail,
  }),
}));

vi.mock('../google/keyring', () => ({
  deriveKeyringPassword: mocks.deriveKeyringPassword,
  getGoogleClientName: mocks.getGoogleClientName,
}));

vi.mock('../google/runtime', () => ({
  buildGogPath: mocks.buildGogPath,
  resolveGogBinaryPath: mocks.resolveGogBinaryPath,
}));

import { runGoogleCliGog } from '../google/cli-runtime';

describe('Google CLI runtime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getEmail.mockReturnValue('user@example.com');
    mocks.execFile.mockImplementation((_file, _args, _options, callback) => {
      callback?.(null, '{"ok":true}', '');
      return {
        on: vi.fn(),
      };
    });
  });

  it('runs on the host with profile-aware auth defaults when no container is active', async () => {
    const result = await runGoogleCliGog(
      ['gmail', 'search', 'newer_than:1d'],
      {
        workspaceId: 'ws-1',
        workspaceManager: {
          isContainerEnabled: vi.fn(async () => false),
        },
        containerManager: {
          hasContainer: vi.fn(() => false),
          exec: vi.fn(),
        },
      },
      { json: true },
    );

    expect(mocks.ensureCredentialsAvailable).toHaveBeenCalledTimes(1);
    expect(mocks.execFile).toHaveBeenCalledWith(
      '/opt/homebrew/bin/gog',
      [
        '--client',
        'profile-work',
        '--account',
        'user@example.com',
        '--json',
        '--no-input',
        'gmail',
        'search',
        'newer_than:1d',
      ],
      expect.objectContaining({
        timeout: 30_000,
        env: expect.objectContaining({
          PATH: '/opt/homebrew/bin:/usr/local/bin',
          GOG_KEYRING_PASSWORD: 'stable-password',
        }),
      }),
      expect.any(Function),
    );
    expect(result).toEqual({ stdout: '{"ok":true}', stderr: '', exitCode: 0 });
  });

  it('routes to the workspace container when container mode is enabled and running', async () => {
    const exec = vi.fn(async () => ({ stdout: 'container ok', stderr: '', exitCode: 0 }));

    const result = await runGoogleCliGog(
      ['calendar', 'events', 'primary', '--today'],
      {
        workspaceId: 'ws-1',
        workspaceManager: {
          isContainerEnabled: vi.fn(async () => true),
        },
        containerManager: {
          hasContainer: vi.fn(() => true),
          exec,
        },
      },
      { json: true, account: 'alias-work' },
    );

    expect(mocks.ensureCredentialsAvailable).not.toHaveBeenCalled();
    expect(exec).toHaveBeenCalledWith(
      'ws-1',
      expect.stringContaining(`'gog' '--client' 'profile-work' '--account' 'alias-work' '--json' '--no-input' 'calendar' 'events' 'primary' '--today'`),
      undefined,
      30_000,
    );
    expect(result).toEqual({ stdout: 'container ok', stderr: '', exitCode: 0 });
  });
});
