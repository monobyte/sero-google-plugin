import { execFile, type ExecFileException } from 'node:child_process';

import {
  deriveKeyringPassword,
  getGoogleClientName,
} from './keyring';
import {
  buildGogPath,
  resolveGogBinaryPath,
} from './runtime';
import { getGoogleAuthManager } from './auth';
import type { GoogleCliContext, GoogleCliResult } from './cli-types';

export interface GogResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface GogOpts {
  json?: boolean;
  account?: string;
  timeoutMs?: number;
  noInput?: boolean;
}

const GOG_TIMEOUT_MS = 30_000;
export const GOG_AUTH_TIMEOUT_MS = 60_000;

function isExecNotFound(error: ExecFileException | null): boolean {
  return error?.code === 'ENOENT';
}

function getExecExitCode(error: ExecFileException | null): number {
  if (!error) return 0;
  return typeof error.code === 'number' ? error.code : 1;
}

function shQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function buildCommand(args: string[]): string {
  return args.map(shQuote).join(' ');
}

function isMissingGogBinaryResult(result: GogResult): boolean {
  if (result.exitCode === 127) return true;

  const combined = `${result.stderr}\n${result.stdout}`.toLowerCase();
  return combined.includes('gog binary not found')
    || combined.includes('gog: not found')
    || combined.includes('command not found')
    || combined.includes('executable file not found');
}

async function resolveDefaultAccount(opts?: GogOpts): Promise<string | undefined> {
  if (opts?.account) return opts.account;

  const auth = getGoogleAuthManager();
  const warmedEmail = auth.getEmail();
  if (warmedEmail) return warmedEmail;

  const status = await auth.getStatus();
  return status.authenticated ? status.email : undefined;
}

function shouldResolveDefaultAccount(gogArgs: string[]): boolean {
  return gogArgs[0] !== 'auth';
}

async function runGogLocal(gogArgs: string[], opts?: GogOpts): Promise<GogResult> {
  const auth = getGoogleAuthManager();
  const account = shouldResolveDefaultAccount(gogArgs)
    ? await resolveDefaultAccount(opts)
    : opts?.account;
  await auth.ensureCredentialsAvailable();

  return new Promise((resolve) => {
    const fullArgs: string[] = [];
    fullArgs.push('--client', getGoogleClientName());
    if (account) fullArgs.push('--account', account);
    if (opts?.json) fullArgs.push('--json');
    if (opts?.noInput !== false) fullArgs.push('--no-input');
    fullArgs.push(...gogArgs);

    const child = execFile(resolveGogBinaryPath(), fullArgs, {
      timeout: opts?.timeoutMs ?? GOG_TIMEOUT_MS,
      maxBuffer: 10 * 1024 * 1024,
      env: {
        ...process.env,
        PATH: buildGogPath(),
        GOG_KEYRING_PASSWORD: deriveKeyringPassword(),
      },
    }, (error: ExecFileException | null, stdout, stderr) => {
      if (isExecNotFound(error)) {
        resolve({ stdout: '', stderr: 'gog binary not found', exitCode: 127 });
        return;
      }
      resolve({
        stdout: stdout ?? '',
        stderr: stderr ?? '',
        exitCode: getExecExitCode(error),
      });
    });

    child.on('error', (error) => {
      resolve({ stdout: '', stderr: error.message, exitCode: 127 });
    });
  });
}

function runGogContainer(
  gogArgs: string[],
  context: GoogleCliContext,
  opts?: GogOpts,
): Promise<GogResult> {
  const parts = ['gog', '--client', getGoogleClientName()];
  if (opts?.account) parts.push('--account', opts.account);
  if (opts?.json) parts.push('--json');
  if (opts?.noInput !== false) parts.push('--no-input');
  parts.push(...gogArgs);

  return context.containerManager.exec(
    context.workspaceId,
    buildCommand(parts),
    undefined,
    opts?.timeoutMs ?? GOG_TIMEOUT_MS,
  );
}

export async function runGoogleCliGog(
  gogArgs: string[],
  context?: GoogleCliContext,
  opts?: GogOpts,
): Promise<GogResult> {
  const useContainer = context
    ? await context.workspaceManager.isContainerEnabled(context.workspaceId)
    : false;
  if (context && useContainer && context.containerManager.hasContainer(context.workspaceId)) {
    const containerResult = await runGogContainer(gogArgs, context, opts);
    if (!isMissingGogBinaryResult(containerResult)) {
      return containerResult;
    }
  }
  return runGogLocal(gogArgs, opts);
}

export function gogResultToCliResult(result: GogResult): GoogleCliResult {
  if (result.exitCode === 127) {
    return {
      output: 'gogcli (gog) not found. Install it: brew install steipete/tap/gogcli\n' +
        'See https://github.com/steipete/gogcli for details.',
      exitCode: 1,
    };
  }

  const output = result.stdout.trim();
  const stderr = result.stderr.trim();

  if (result.exitCode !== 0) {
    const errorText = stderr || output || 'Command failed';
    if (errorText.includes('no authenticated accounts') || errorText.includes('not authenticated')) {
      return {
        output: `${errorText}\n\nHint: Sign in to Google via Sero's Settings > Google, or run "sero google auth add <email>".`,
        exitCode: 1,
      };
    }
    return { output: errorText, exitCode: 1 };
  }

  const parts = [output];
  if (stderr && !stderr.startsWith('{')) {
    parts.push(`\n[stderr] ${stderr}`);
  }
  return { output: parts.join(''), exitCode: 0 };
}
