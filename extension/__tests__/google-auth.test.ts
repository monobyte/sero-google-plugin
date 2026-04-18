import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getGoogleCredentials: vi.fn(),
  getGoogleOAuthNotConfiguredMessage: vi.fn(() => 'Google OAuth not configured'),
  startOAuthLoopbackServer: vi.fn(),
  exchangeCodeForTokens: vi.fn(),
  fetchGoogleUserEmail: vi.fn(),
  findAccessibleEmail: vi.fn(),
  migrateFromBuggyKeyring: vi.fn(),
  deriveKeyringPassword: vi.fn(() => 'stable-password'),
  getGoogleClientName: vi.fn(() => 'profile-work'),
  argsWithClient: vi.fn((clientName: string, args: string[]) => ['--client', clientName, ...args]),
  pipeToGog: vi.fn(),
  ensureCredentials: vi.fn(),
  importRefreshToken: vi.fn(),
  resetCredentials: vi.fn(),
}));

vi.mock('../google/config', () => ({
  AUTH_URL: 'https://accounts.google.com/o/oauth2/v2/auth',
  LOOPBACK: '127.0.0.1',
  SCOPES: 'openid email',
  getGoogleCredentials: mocks.getGoogleCredentials,
  getGoogleOAuthNotConfiguredMessage: mocks.getGoogleOAuthNotConfiguredMessage,
}));

vi.mock('../google/oauth-loopback', () => ({
  startOAuthLoopbackServer: mocks.startOAuthLoopbackServer,
  exchangeCodeForTokens: mocks.exchangeCodeForTokens,
  fetchGoogleUserEmail: mocks.fetchGoogleUserEmail,
}));

vi.mock('../google/status', () => ({
  findAccessibleEmail: mocks.findAccessibleEmail,
  migrateFromBuggyKeyring: mocks.migrateFromBuggyKeyring,
}));

vi.mock('../google/keyring', () => ({
  argsWithClient: mocks.argsWithClient,
  deriveKeyringPassword: mocks.deriveKeyringPassword,
  getGoogleClientName: mocks.getGoogleClientName,
  pipeToGog: mocks.pipeToGog,
}));

vi.mock('../google/credentials', () => ({
  GoogleCredentialManager: class {
    reset(): void {
      mocks.resetCredentials();
    }

    ensureCredentials(clientName: string): Promise<void> {
      return mocks.ensureCredentials(clientName);
    }

    importRefreshToken(clientName: string, email: string, refreshToken: string): Promise<void> {
      return mocks.importRefreshToken(clientName, email, refreshToken);
    }
  },
}));

import { GoogleAuthManager } from '../google/auth';

describe('GoogleAuthManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getGoogleCredentials.mockReturnValue({
      clientId: 'google-client-id',
      clientSecret: 'google-client-secret',
    });
    mocks.findAccessibleEmail.mockResolvedValue(null);
    mocks.migrateFromBuggyKeyring.mockResolvedValue(null);
    mocks.ensureCredentials.mockResolvedValue(undefined);
    mocks.importRefreshToken.mockResolvedValue(undefined);
    mocks.pipeToGog.mockResolvedValue({ ok: true, out: '' });
  });

  it('drives the loopback login flow and imports the refresh token into the profile bucket', async () => {
    const server = { close: vi.fn() };
    mocks.startOAuthLoopbackServer.mockResolvedValue({
      port: 4815,
      getCode: Promise.resolve('auth-code'),
      server,
    });
    mocks.exchangeCodeForTokens.mockResolvedValue({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      expires_in: 3600,
    });
    mocks.fetchGoogleUserEmail.mockResolvedValue('user@example.com');

    const openedUrls: string[] = [];
    const progressTypes: string[] = [];
    const manager = new GoogleAuthManager({
      openExternal: async (url) => {
        openedUrls.push(url);
      },
    });

    await manager.login((event) => {
      progressTypes.push(event.type);
    });

    expect(openedUrls).toHaveLength(1);
    expect(openedUrls[0]).toContain('client_id=google-client-id');
    expect(openedUrls[0]).toContain('redirect_uri=http%3A%2F%2F127.0.0.1%3A4815');
    expect(progressTypes).toEqual(['browser', 'waiting', 'success']);
    expect(mocks.importRefreshToken).toHaveBeenCalledWith(
      'profile-work',
      'user@example.com',
      'refresh-token',
    );
    expect(server.close).toHaveBeenCalledTimes(1);
    expect(manager.getEmail()).toBe('user@example.com');
  });

  it('migrates legacy buggy-password tokens before reporting authenticated status', async () => {
    mocks.findAccessibleEmail
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('migrated@example.com');
    mocks.migrateFromBuggyKeyring.mockResolvedValue('migrated@example.com');

    const manager = new GoogleAuthManager();
    const status = await manager.getStatus();

    expect(status).toEqual({
      configured: true,
      authenticated: true,
      email: 'migrated@example.com',
    });
    expect(mocks.migrateFromBuggyKeyring).toHaveBeenCalledTimes(1);
    expect(mocks.ensureCredentials).toHaveBeenCalledWith('profile-work');
  });
});
