import crypto from 'node:crypto';
import { readdirSync, readFileSync, unlinkSync } from 'node:fs';
import { homedir, hostname, tmpdir, userInfo } from 'node:os';
import path from 'node:path';

import {
  getActiveProfileId,
  getAgentDir,
  getSeroFixedRoot,
  getSeroHome,
} from './env';
import { buildGogPath, execGog } from './runtime';

export const GOG_DEFAULT_CLIENT = 'default';

const GOG_KEYRING_DIR = path.join(
  homedir(),
  'Library',
  'Application Support',
  'gogcli',
  'keyring',
);

export interface GoogleClientContext {
  seroHome?: string;
  fixedRoot?: string;
  agentDir?: string;
  activeProfileId?: string | null;
}

/** Stable machine/user keyring password used by Sero. */
export function deriveKeyringPassword(): string {
  const host = hostname();
  let uid: string;
  try {
    uid = String(userInfo().uid);
  } catch {
    uid = 'unknown';
  }
  return crypto.createHash('sha256')
    .update(`sero-google-keyring:${host}:${uid}`)
    .digest('hex')
    .slice(0, 32);
}

/** Buggy profile-scoped password used by the previous implementation. */
export function deriveProfileScopedKeyringPassword(profileAgentDir: string): string {
  const host = hostname();
  let uid: string;
  try {
    uid = String(userInfo().uid);
  } catch {
    uid = 'unknown';
  }
  return crypto.createHash('sha256')
    .update(`sero-google-keyring:${host}:${uid}:${profileAgentDir}`)
    .digest('hex')
    .slice(0, 32);
}

export function resolveGoogleClientName(context: GoogleClientContext = {}): string {
  const fixedRoot = context.fixedRoot ?? getSeroFixedRoot();
  const seroHome = context.seroHome ?? getSeroHome(fixedRoot);
  if (path.resolve(seroHome) === path.resolve(fixedRoot)) {
    return GOG_DEFAULT_CLIENT;
  }

  const agentDir = context.agentDir ?? getAgentDir(seroHome);
  const rawId = context.activeProfileId
    ?? getActiveProfileId(fixedRoot)
    ?? crypto.createHash('sha1').update(agentDir).digest('hex').slice(0, 12);
  const safeId = rawId.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  return `profile-${safeId}`;
}

/** Current gogcli client bucket for the active Sero profile. */
export function getGoogleClientName(): string {
  return resolveGoogleClientName();
}

export function argsWithClient(clientName: string, args: string[]): string[] {
  return ['--client', clientName, ...args];
}

function gogEnv(password?: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PATH: buildGogPath(),
    GOG_KEYRING_PASSWORD: password ?? deriveKeyringPassword(),
  };
}

export async function pipeToGog(
  args: string[],
  stdin: string,
  password?: string,
): Promise<{ ok: boolean; out: string }> {
  const result = await execGog(args, {
    stdin,
    env: gogEnv(password),
    timeoutMs: 10_000,
  });
  if (result.exitCode !== 0) {
    console.warn(
      `[google-auth] gog ${args.slice(0, 4).join(' ')} failed:`,
      result.stderr.trim() || result.stdout.trim() || `exit ${result.exitCode}`,
    );
  }
  return { ok: result.exitCode === 0, out: result.stdout.trim() };
}

export async function gogExecWithPassword(
  args: string[],
  password: string,
): Promise<string | null> {
  const result = await execGog(args, {
    env: gogEnv(password),
    timeoutMs: 10_000,
  });
  if (result.exitCode !== 0) {
    console.warn(
      `[google-auth] gogExec ${args.join(' ')} failed:`,
      result.stderr.trim() || result.stdout.trim() || `exit ${result.exitCode}`,
    );
    return null;
  }
  return result.stdout;
}

export function findTokenCandidateEmails(): string[] {
  try {
    const emails = new Set<string>();
    for (const entry of readdirSync(GOG_KEYRING_DIR)) {
      if (!entry.startsWith('token:')) continue;
      const email = entry.split(':').at(-1) ?? '';
      if (email.includes('@')) emails.add(email);
    }
    return [...emails];
  } catch {
    return [];
  }
}

export function parseEmailFromTokenData(tokenData: string): string | null {
  try {
    const parsed = JSON.parse(tokenData) as { email?: string };
    return typeof parsed.email === 'string' ? parsed.email : null;
  } catch {
    return null;
  }
}

export async function exportTokenForClient(
  email: string,
  password: string,
  clientName: string,
): Promise<string | null> {
  const tmpFile = path.join(
    tmpdir(),
    `sero-gog-export-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`,
  );

  const result = await gogExecWithPassword(
    argsWithClient(clientName, [
      'auth',
      'tokens',
      'export',
      email,
      '--out',
      tmpFile,
      '--overwrite',
    ]),
    password,
  );
  if (!result) return null;

  try {
    return readFileSync(tmpFile, 'utf8');
  } catch {
    return null;
  } finally {
    try {
      unlinkSync(tmpFile);
    } catch {
      /* ignore */
    }
  }
}
