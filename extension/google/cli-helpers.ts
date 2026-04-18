import type { GoogleCliResult } from './cli-types';

export function ok(output: string, details?: unknown): GoogleCliResult {
  return { output, exitCode: 0, details };
}

export function fail(message: string, exitCode = 1, details?: unknown): GoogleCliResult {
  const output = message.startsWith('ERROR:') ? message : `ERROR: ${message}`;
  return { output, exitCode, details };
}

export function parseFlags(args: string[]): {
  positionals: string[];
  flags: Map<string, string | true>;
} {
  const positionals: string[] = [];
  const flags = new Map<string, string | true>();

  for (let index = 0; index < args.length; index++) {
    const token = args[index]!;
    if (!token.startsWith('--')) {
      positionals.push(token);
      continue;
    }

    const keyValue = token.slice(2);
    if (!keyValue) continue;

    const eqIndex = keyValue.indexOf('=');
    if (eqIndex !== -1) {
      flags.set(keyValue.slice(0, eqIndex), keyValue.slice(eqIndex + 1));
      continue;
    }

    const next = args[index + 1];
    if (next && !next.startsWith('--')) {
      flags.set(keyValue, next);
      index++;
    } else {
      flags.set(keyValue, true);
    }
  }

  return { positionals, flags };
}

export function requireFlagString(
  flags: Map<string, string | true>,
  key: string,
): string | null {
  const value = flags.get(key);
  return typeof value === 'string' ? value : null;
}

export function extractAccount(args: string[]): { cleaned: string[]; account?: string } {
  const { positionals, flags } = parseFlags(args);
  const account = requireFlagString(flags, 'account') ?? undefined;

  const cleaned: string[] = [...positionals];
  for (const [key, value] of flags) {
    if (key === 'account') continue;
    if (value === true) {
      cleaned.push(`--${key}`);
    } else {
      cleaned.push(`--${key}`, value);
    }
  }

  return { cleaned, account };
}
