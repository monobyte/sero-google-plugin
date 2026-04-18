import { execFile, type ExecFileException } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const GOG_SEARCH_PATHS = [
  '/opt/homebrew/bin/gog',
  '/usr/local/bin/gog',
  path.join(homedir(), '.local/bin/gog'),
  path.join(homedir(), 'go/bin/gog'),
] as const;

const GOG_EXTRA_PATHS = [
  '/opt/homebrew/bin',
  '/usr/local/bin',
  path.join(homedir(), '.local/bin'),
  path.join(homedir(), 'go/bin'),
] as const;

let resolvedGogPath: string | null | undefined;

export interface GogExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface GogExecOptions {
  stdin?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  maxBuffer?: number;
}

export function resolveGogBinaryPath(): string {
  if (resolvedGogPath !== undefined) return resolvedGogPath ?? 'gog';

  for (const candidate of GOG_SEARCH_PATHS) {
    if (existsSync(candidate)) {
      resolvedGogPath = candidate;
      return candidate;
    }
  }

  resolvedGogPath = null;
  return 'gog';
}

export function buildGogPath(existingPath: string = process.env.PATH || ''): string {
  return [...new Set([...GOG_EXTRA_PATHS, ...existingPath.split(':').filter(Boolean)])].join(':');
}

function getExecExitCode(error: ExecFileException | null): number {
  if (!error) return 0;
  return typeof error.code === 'number' ? error.code : 1;
}

export function execGog(
  args: string[],
  options: GogExecOptions = {},
): Promise<GogExecResult> {
  return new Promise((resolve) => {
    const child = execFile(resolveGogBinaryPath(), args, {
      env: options.env,
      timeout: options.timeoutMs,
      maxBuffer: options.maxBuffer,
    }, (error, stdout, stderr) => {
      if (error?.code === 'ENOENT') {
        resolve({ stdout: '', stderr: 'gog binary not found', exitCode: 127 });
        return;
      }

      resolve({
        stdout: stdout ?? '',
        stderr: stderr ?? '',
        exitCode: getExecExitCode(error),
      });
    });

    if (options.stdin !== undefined) {
      child.stdin?.write(options.stdin);
      child.stdin?.end();
    }

    child.on('error', (error) => {
      resolve({ stdout: '', stderr: error.message, exitCode: 127 });
    });
  });
}
