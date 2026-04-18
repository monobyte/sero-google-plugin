import { readFileSync } from 'node:fs';
import path from 'node:path';

import { getAgentDir } from './env';

export const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';
export const LOOPBACK = '127.0.0.1';
export const GOOGLE_PLUGIN_ID = 'sero-google-plugin';

export const SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://mail.google.com/',
  'https://www.googleapis.com/auth/calendar',
].join(' ');

export interface GoogleCredentials {
  clientId: string;
  clientSecret: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readGooglePluginConfig(agentDir: string = getAgentDir()): Record<string, unknown> | null {
  const configPath = getGooglePluginConfigPath(agentDir);
  try {
    const raw = readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function getGoogleCredentials(agentDir: string = getAgentDir()): GoogleCredentials {
  const config = readGooglePluginConfig(agentDir);
  const clientId = typeof config?.clientId === 'string'
    ? config.clientId
    : process.env.GOOGLE_CLIENT_ID || '';
  const clientSecret = typeof config?.clientSecret === 'string'
    ? config.clientSecret
    : process.env.GOOGLE_CLIENT_SECRET || '';
  return { clientId, clientSecret };
}

export function getGooglePluginConfigPath(agentDir: string = getAgentDir()): string {
  return path.join(agentDir, 'plugin-config', `${GOOGLE_PLUGIN_ID}.json`);
}

export function getGoogleOAuthNotConfiguredMessage(agentDir: string = getAgentDir()): string {
  const configPath = getGooglePluginConfigPath(agentDir);
  return `Google OAuth not configured. Use the setup form in the Google plugin or add credentials to ${configPath}`;
}
