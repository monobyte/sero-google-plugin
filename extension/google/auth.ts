import crypto from 'node:crypto';

import { GoogleCredentialManager } from './credentials';
import {
  AUTH_URL,
  LOOPBACK,
  SCOPES,
  getGoogleCredentials,
  getGoogleOAuthNotConfiguredMessage,
} from './config';
import {
  exchangeCodeForTokens,
  fetchGoogleUserEmail,
  startOAuthLoopbackServer,
} from './oauth-loopback';
import {
  findAccessibleEmail,
  migrateFromBuggyKeyring,
} from './status';
import {
  argsWithClient,
  deriveKeyringPassword,
  getGoogleClientName,
  pipeToGog,
} from './keyring';
import type {
  GoogleAuthProgress,
  GoogleAuthStatus,
} from './types';

export type { GoogleAuthProgress, GoogleAuthStatus } from './types';

export type GoogleBrowserOpener = (url: string) => Promise<void> | void;

export interface GoogleAuthManagerOptions {
  openExternal?: GoogleBrowserOpener;
}

export class GoogleAuthManager {
  private email: string | null = null;
  private statusCache: { validUntil: number; result: GoogleAuthStatus } | null = null;
  private static STATUS_CACHE_TTL = 30_000;
  private migrationAttempted = false;
  private readonly credentialManager = new GoogleCredentialManager();
  private openExternal?: GoogleBrowserOpener;

  constructor(options: GoogleAuthManagerOptions = {}) {
    this.openExternal = options.openExternal;
  }

  setBrowserOpener(openExternal?: GoogleBrowserOpener): void {
    this.openExternal = openExternal;
  }

  isConfigured(): boolean {
    const { clientId, clientSecret } = getGoogleCredentials();
    return !!clientId && !!clientSecret;
  }

  getEmail(): string | null {
    return this.email;
  }

  resetForConfigChange(): void {
    this.statusCache = null;
    this.credentialManager.reset();
  }

  async ensureCredentialsAvailable(): Promise<void> {
    if (!this.isConfigured()) return;
    await this.credentialManager.ensureCredentials(getGoogleClientName());
  }

  async getStatus(): Promise<GoogleAuthStatus> {
    if (!this.isConfigured()) return { configured: false, authenticated: false };

    if (this.statusCache && Date.now() < this.statusCache.validUntil) {
      return this.statusCache.result;
    }

    const clientName = getGoogleClientName();
    let email = await findAccessibleEmail(deriveKeyringPassword(), clientName);

    if (!email && !this.migrationAttempted) {
      this.migrationAttempted = true;
      const migratedEmail = await migrateFromBuggyKeyring(
        clientName,
        () => this.credentialManager.ensureCredentials(clientName),
      );
      if (migratedEmail) {
        email = await findAccessibleEmail(deriveKeyringPassword(), clientName);
      }
    }

    if (!email) {
      this.email = null;
      return this.cacheStatus({ configured: true, authenticated: false });
    }

    this.email = email;
    await this.credentialManager.ensureCredentials(clientName);
    return this.cacheStatus({ configured: true, authenticated: true, email });
  }

  async login(onProgress: (event: GoogleAuthProgress) => void): Promise<void> {
    if (!this.isConfigured()) {
      throw new Error(getGoogleOAuthNotConfiguredMessage());
    }

    if (!this.openExternal) {
      throw new Error('Google sign-in requires a browser opener');
    }

    const verifier = crypto.randomBytes(32).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');

    const { port, getCode, server } = await startOAuthLoopbackServer();
    const redirectUri = `http://${LOOPBACK}:${port}`;

    const creds = getGoogleCredentials();
    const params = new URLSearchParams({
      client_id: creds.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: SCOPES,
      access_type: 'offline',
      prompt: 'consent',
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });

    onProgress({ type: 'browser', message: 'Opening Google sign-in…' });
    await Promise.resolve(this.openExternal(`${AUTH_URL}?${params}`));
    onProgress({ type: 'waiting', message: 'Waiting for authorization…' });

    let code: string;
    try {
      code = await getCode;
    } finally {
      server.close();
    }

    const tokens = await exchangeCodeForTokens(code, redirectUri, verifier);
    if (!tokens.refresh_token) {
      throw new Error('No refresh token. Revoke access at myaccount.google.com/permissions and retry.');
    }

    const email = await fetchGoogleUserEmail(tokens.access_token);
    this.email = email;

    await this.credentialManager.importRefreshToken(
      getGoogleClientName(),
      email,
      tokens.refresh_token,
    );

    this.statusCache = null;
    onProgress({ type: 'success', message: `Signed in as ${email}`, email });
  }

  async logout(): Promise<void> {
    this.statusCache = null;
    const clientName = getGoogleClientName();
    const email = this.email ?? await findAccessibleEmail(deriveKeyringPassword(), clientName);
    if (email) {
      await pipeToGog(
        argsWithClient(clientName, ['auth', 'tokens', 'delete', email, '--force']),
        '',
      );
    }
    this.email = null;
  }

  private cacheStatus(result: GoogleAuthStatus): GoogleAuthStatus {
    this.statusCache = {
      validUntil: Date.now() + GoogleAuthManager.STATUS_CACHE_TTL,
      result,
    };
    return result;
  }
}

let sharedGoogleAuthManager: GoogleAuthManager | null = null;

export function getGoogleAuthManager(): GoogleAuthManager {
  if (!sharedGoogleAuthManager) {
    sharedGoogleAuthManager = new GoogleAuthManager();
  }
  return sharedGoogleAuthManager;
}

export function resetGoogleAuthManager(): void {
  sharedGoogleAuthManager = null;
}
