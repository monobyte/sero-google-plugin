/**
 * gogcli execution helper — spawns `gog` with Sero's Google auth contract.
 *
 * Keeps the plugin aligned with the shell-owned runtime semantics by using
 * profile-aware `--client` buckets, stable keyring passwords, credential
 * import, and legacy-token migration before gog execution.
 */

import { getGoogleAuthManager } from './google/auth';
import {
  deriveKeyringPassword,
  getGoogleClientName,
} from './google/keyring';
import {
  buildGogPath,
  execGog,
  type GogExecResult,
} from './google/runtime';

export type GogResult = GogExecResult;

const GOG_TIMEOUT_MS = 30_000;

/**
 * Run a gogcli command and return raw output.
 */
export async function runGog(
  args: string[],
  opts?: { account?: string; timeoutMs?: number; json?: boolean },
): Promise<GogResult> {
  const auth = getGoogleAuthManager();
  const status = opts?.account ? null : await auth.getStatus();
  await auth.ensureCredentialsAvailable();

  const fullArgs: string[] = ['--client', getGoogleClientName()];
  const account = opts?.account ?? (status?.authenticated ? status.email : auth.getEmail()) ?? undefined;
  if (account) fullArgs.push('--account', account);
  if (opts?.json !== false) fullArgs.push('--json');
  fullArgs.push('--no-input', ...args);

  return execGog(fullArgs, {
    timeoutMs: opts?.timeoutMs ?? GOG_TIMEOUT_MS,
    maxBuffer: 10 * 1024 * 1024,
    env: {
      ...process.env,
      PATH: buildGogPath(),
      GOG_KEYRING_PASSWORD: deriveKeyringPassword(),
    },
  });
}

/**
 * Run gogcli and parse the JSON output. Returns null on failure.
 */
export async function runGogJson<T = unknown>(
  args: string[],
  opts?: { account?: string; timeoutMs?: number },
): Promise<{ data: T | null; error: string | null }> {
  const result = await runGog(args, { ...opts, json: true });

  if (result.exitCode === 127) {
    return { data: null, error: 'gogcli (gog) not found. Install: brew install steipete/tap/gogcli' };
  }
  if (result.exitCode !== 0) {
    return { data: null, error: result.stderr.trim() || result.stdout.trim() || 'Command failed' };
  }
  try {
    return { data: JSON.parse(result.stdout) as T, error: null };
  } catch {
    return { data: null, error: result.stdout.trim() || 'Failed to parse output' };
  }
}
