import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  handleGoogleCliCommand: vi.fn(),
}));

vi.mock('../google/cli-handlers', () => ({
  GOOGLE_CLI_SUMMARY: 'Google Workspace commands — Gmail, Calendar, auth (via gogcli)',
  GOOGLE_CLI_HELP: 'google help',
  handleGoogleCliCommand: mocks.handleGoogleCliCommand,
}));

import { createGoogleCliTool } from '../google/cli-tool';

describe('Google CLI tool definition', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exposes custom CLI bridge metadata that can replace the builtin google command', async () => {
    mocks.handleGoogleCliCommand.mockResolvedValue({ output: '{"ok":true}', exitCode: 0 });
    const tool = createGoogleCliTool();

    expect(tool.cli.summary).toContain('Gmail, Calendar, auth');
    expect(tool.cli.help).toBe('google help');
    expect(tool.cli.overrideBuiltin).toBe(true);

    const cliResult = await tool.cli.execute(
      ['auth', 'list'],
      {
        workspaceId: 'ws-1',
        workspaceManager: { isContainerEnabled: vi.fn(async () => false) },
        containerManager: { hasContainer: vi.fn(() => false), exec: vi.fn() },
        invocation: { source: 'terminal' },
      } as never,
    );

    expect(mocks.handleGoogleCliCommand).toHaveBeenCalledWith(
      ['auth', 'list'],
      expect.objectContaining({
        workspaceId: 'ws-1',
        access: 'operator',
      }),
    );
    expect(cliResult).toEqual({ output: '{"ok":true}', exitCode: 0 });
  });

  it('marks bridged CLI invocations from the agent as agent-facing access', async () => {
    mocks.handleGoogleCliCommand.mockResolvedValue({ output: 'blocked', exitCode: 1 });
    const tool = createGoogleCliTool();

    await tool.cli.execute(
      ['auth', 'list'],
      {
        workspaceId: 'ws-1',
        workspaceManager: { isContainerEnabled: vi.fn(async () => false) },
        containerManager: { hasContainer: vi.fn(() => false), exec: vi.fn() },
        invocation: { source: 'tool' },
      } as never,
    );

    expect(mocks.handleGoogleCliCommand).toHaveBeenCalledWith(
      ['auth', 'list'],
      expect.objectContaining({
        workspaceId: 'ws-1',
        access: 'agent',
      }),
    );
  });

  it('supports structured non-CLI execution for plain Pi tool usage', async () => {
    mocks.handleGoogleCliCommand.mockResolvedValue({ output: 'search ok', exitCode: 0, details: { count: 1 } });
    const tool = createGoogleCliTool();

    const result = await tool.execute(
      'tool-1',
      {
        service: 'gmail',
        action: 'search',
        args: ['newer_than:1d', '--max', '5'],
      },
      undefined,
      undefined,
      undefined as never,
    );

    expect(mocks.handleGoogleCliCommand).toHaveBeenCalledWith(
      ['gmail', 'search', 'newer_than:1d', '--max', '5'],
      undefined,
      { access: 'agent' },
    );
    expect(result).toEqual({
      content: [{ type: 'text', text: 'search ok' }],
      details: { count: 1 },
    });
  });

  it('maps structured failures onto the standard Error: tool result contract', async () => {
    mocks.handleGoogleCliCommand.mockResolvedValue({ output: 'ERROR: auth failed', exitCode: 1 });
    const tool = createGoogleCliTool();

    const result = await tool.execute(
      'tool-1',
      {
        service: 'auth',
        action: 'status',
      },
      undefined,
      undefined,
      undefined as never,
    );

    expect(result).toEqual({
      content: [{ type: 'text', text: 'Error: auth failed' }],
      details: {},
    });
  });
});
