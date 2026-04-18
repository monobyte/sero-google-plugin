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

  it('sends a follow-up assistant message for successful agent-facing CLI results', async () => {
    const sendMessage = vi.fn(async () => undefined);
    mocks.runGoogleCliGog.mockResolvedValueOnce({
      stdout: 'https://mail.google.com/mail/u/0/#inbox/thread-1',
      stderr: '',
      exitCode: 0,
    });

    await handleGoogleCliCommand(
      ['gmail', 'url', 'thread-1'],
      {
        workspaceId: 'ws-1',
        workspaceManager: { isContainerEnabled: vi.fn(async () => false) },
        containerManager: { hasContainer: vi.fn(() => false), exec: vi.fn() },
        access: 'agent',
        sessionRuntime: { sendMessage },
      },
    );

    expect(sendMessage).toHaveBeenCalledWith(
      {
        customType: '',
        content: [{ type: 'text', text: 'https://mail.google.com/mail/u/0/#inbox/thread-1' }],
        display: true,
        details: undefined,
      },
      { triggerTurn: false, deliverAs: 'followUp' },
    );
  });

  it('reuses the shell-compatible top-level summary/help text', () => {
    expect(GOOGLE_CLI_SUMMARY).toContain('Gmail, Calendar, auth');
    expect(GOOGLE_CLI_HELP).toContain('sero google auth list');
    expect(GOOGLE_CLI_HELP).toContain('sero google gmail search');
    expect(GOOGLE_CLI_HELP).toContain('sero google calendar events primary --today');
  });

  it('keeps auth management commands available for operator CLI usage', async () => {
    await handleGoogleCliCommand(['auth', 'list', '--check', '--account', 'work'], undefined, {
      access: 'operator',
    });

    expect(mocks.runGoogleCliGog).toHaveBeenCalledWith(
      ['auth', 'list', '--check'],
      undefined,
      { account: 'work' },
    );
  });

  it('does not send a follow-up assistant message for operator CLI usage', async () => {
    const sendMessage = vi.fn(async () => undefined);

    await handleGoogleCliCommand(
      ['gmail', 'url', 'thread-1'],
      {
        workspaceId: 'ws-1',
        workspaceManager: { isContainerEnabled: vi.fn(async () => false) },
        containerManager: { hasContainer: vi.fn(() => false), exec: vi.fn() },
        access: 'operator',
        sessionRuntime: { sendMessage },
      },
    );

    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('blocks agent-facing auth management commands before gog/keyring internals are touched', async () => {
    const result = await handleGoogleCliCommand(['auth', 'list'], undefined, {
      access: 'agent',
    });

    expect(mocks.runGoogleCliGog).not.toHaveBeenCalled();
    expect(result).toEqual({
      output: 'ERROR: Google auth management commands are operator-only. Use the Google app sign-in UI or ask the user to run "sero google auth ..." in a terminal.',
      exitCode: 1,
      details: {
        blocked: true,
        operatorOnly: true,
        service: 'auth',
      },
    });
    expect(result.output).not.toContain('keyring');
  });

  it('forwards gmail search queries through the parity handler with json output', async () => {
    await handleGoogleCliCommand(['gmail', 'search', 'from:boss newer_than:1d', '--max', '5']);

    expect(mocks.runGoogleCliGog).toHaveBeenCalledWith(
      ['gmail', 'search', 'from:boss newer_than:1d', '--max', '5'],
      undefined,
      { json: true, account: undefined },
    );
  });

  it('forwards gmail label listing through the parity handler with json output', async () => {
    await handleGoogleCliCommand(['gmail', 'labels', 'list']);

    expect(mocks.runGoogleCliGog).toHaveBeenCalledWith(
      ['gmail', 'labels', 'list'],
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

  it('forwards calendar freebusy checks through the parity handler with json output', async () => {
    await handleGoogleCliCommand(['calendar', 'freebusy', '--from', '9:00', '--to', '17:00']);

    expect(mocks.runGoogleCliGog).toHaveBeenCalledWith(
      ['calendar', 'freebusy', '--from', '9:00', '--to', '17:00'],
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
