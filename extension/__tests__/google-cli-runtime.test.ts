import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  execFile: vi.fn(),
  ensureCredentialsAvailable: vi.fn(),
  getEmail: vi.fn((): string | null => 'user@example.com'),
  getStatus: vi.fn(async () => ({
    configured: true,
    authenticated: true,
    email: 'user@example.com',
  })),
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
    getStatus: mocks.getStatus,
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
    mocks.getStatus.mockResolvedValue({
      configured: true,
      authenticated: true,
      email: 'user@example.com',
    });
    mocks.execFile.mockImplementation((_file, _args, _options, callback) => {
      callback?.(null, '{"ok":true}', '');
      return {
        on: vi.fn(),
      };
    });
  });

  it('resolves the active Gmail account from persisted auth state in a fresh host session', async () => {
    mocks.getEmail.mockReturnValue(null);
    mocks.getStatus.mockResolvedValue({
      configured: true,
      authenticated: true,
      email: 'persisted@gmail.test',
    });

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

    expect(mocks.getStatus).toHaveBeenCalledTimes(1);
    expect(mocks.ensureCredentialsAvailable).toHaveBeenCalledTimes(1);
    expect(mocks.execFile).toHaveBeenCalledWith(
      '/opt/homebrew/bin/gog',
      [
        '--client',
        'profile-work',
        '--account',
        'persisted@gmail.test',
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

  it('resolves the active Calendar account from persisted auth state in a fresh host session', async () => {
    mocks.getEmail.mockReturnValue(null);
    mocks.getStatus.mockResolvedValue({
      configured: true,
      authenticated: true,
      email: 'calendar@example.com',
    });

    await runGoogleCliGog(
      ['calendar', 'events', 'primary', '--today'],
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

    expect(mocks.execFile).toHaveBeenCalledWith(
      '/opt/homebrew/bin/gog',
      [
        '--client',
        'profile-work',
        '--account',
        'calendar@example.com',
        '--json',
        '--no-input',
        'calendar',
        'events',
        'primary',
        '--today',
      ],
      expect.any(Object),
      expect.any(Function),
    );
  });

  it('does not auto-resolve an account for auth-management commands', async () => {
    mocks.getEmail.mockReturnValue(null);

    await runGoogleCliGog(
      ['auth', 'list'],
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
    );

    expect(mocks.getStatus).not.toHaveBeenCalled();
    expect(mocks.execFile).toHaveBeenCalledWith(
      '/opt/homebrew/bin/gog',
      [
        '--client',
        'profile-work',
        '--no-input',
        'auth',
        'list',
      ],
      expect.any(Object),
      expect.any(Function),
    );
  });

  it('routes to the workspace container when container mode is enabled and gog is available there', async () => {
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

  it('falls back to host gog execution when a container-backed workspace lacks gogcli', async () => {
    mocks.getEmail.mockReturnValue(null);
    mocks.getStatus.mockResolvedValue({
      configured: true,
      authenticated: true,
      email: 'fallback@example.com',
    });

    const exec = vi.fn(async () => ({
      stdout: '',
      stderr: 'sh: gog: command not found',
      exitCode: 127,
    }));

    await runGoogleCliGog(
      ['gmail', 'search', 'label:inbox'],
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
      { json: true },
    );

    expect(exec).toHaveBeenCalledTimes(1);
    expect(mocks.ensureCredentialsAvailable).toHaveBeenCalledTimes(1);
    expect(mocks.execFile).toHaveBeenCalledWith(
      '/opt/homebrew/bin/gog',
      [
        '--client',
        'profile-work',
        '--account',
        'fallback@example.com',
        '--json',
        '--no-input',
        'gmail',
        'search',
        'label:inbox',
      ],
      expect.any(Object),
      expect.any(Function),
    );
  });
});
