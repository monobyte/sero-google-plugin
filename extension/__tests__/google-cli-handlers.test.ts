import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  runGoogleCliGog: vi.fn(),
  gogResultToCliResult: vi.fn((result: { stdout: string; exitCode: number }) => ({
    output: result.stdout || 'ok',
    exitCode: result.exitCode,
  })),
}));

vi.mock('../google/cli-runtime', () => ({
  GOG_AUTH_TIMEOUT_MS: 60_000,
  runGoogleCliGog: mocks.runGoogleCliGog,
  gogResultToCliResult: mocks.gogResultToCliResult,
}));

import {
  GOOGLE_CLI_HELP,
  GOOGLE_CLI_SUMMARY,
  handleGoogleCliCommand,
} from '../google/cli-handlers';

describe('Google CLI handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.runGoogleCliGog.mockResolvedValue({ stdout: '{"ok":true}', stderr: '', exitCode: 0 });
  });

  it('reuses the shell-compatible top-level summary/help text', () => {
    expect(GOOGLE_CLI_SUMMARY).toContain('Gmail, Calendar, auth');
    expect(GOOGLE_CLI_HELP).toContain('sero google auth list');
    expect(GOOGLE_CLI_HELP).toContain('sero google gmail search');
    expect(GOOGLE_CLI_HELP).toContain('sero google calendar events primary --today');
  });

  it('forwards auth list flags and account selection to the gog runtime', async () => {
    await handleGoogleCliCommand(['auth', 'list', '--check', '--account', 'work']);

    expect(mocks.runGoogleCliGog).toHaveBeenCalledWith(
      ['auth', 'list', '--check'],
      undefined,
      { account: 'work' },
    );
  });

  it('forwards gmail search queries through the parity handler with json output', async () => {
    await handleGoogleCliCommand(['gmail', 'search', 'from:boss newer_than:1d', '--max', '5']);

    expect(mocks.runGoogleCliGog).toHaveBeenCalledWith(
      ['gmail', 'search', 'from:boss newer_than:1d', '--max', '5'],
      undefined,
      { json: true, account: undefined },
    );
  });

  it('forwards calendar event listing flags through the parity handler with json output', async () => {
    await handleGoogleCliCommand(['calendar', 'events', 'primary', '--today']);

    expect(mocks.runGoogleCliGog).toHaveBeenCalledWith(
      ['calendar', 'events', 'primary', '--today'],
      undefined,
      { json: true, account: undefined },
    );
  });

  it('returns the same unknown-service error contract as the shell command', async () => {
    const result = await handleGoogleCliCommand(['drive', 'files']);
    expect(result).toEqual({
      output: 'ERROR: Unknown Google service: drive. Available: auth, gmail, calendar',
      exitCode: 1,
      details: undefined,
    });
  });
});
