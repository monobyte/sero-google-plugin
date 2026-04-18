import { StringEnum } from '@mariozechner/pi-ai';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { Text } from '@mariozechner/pi-tui';
import { Type, type Static } from '@sinclair/typebox';

import { errorToolResult, textToolResult } from '../tool-results';
import {
  GOOGLE_CLI_HELP,
  GOOGLE_CLI_SUMMARY,
  handleGoogleCliCommand,
} from './cli-handlers';
import type {
  GoogleCliContext,
  GoogleCliToolDefinition,
} from './cli-types';

const GoogleToolParams = Type.Object({
  service: StringEnum(['auth', 'gmail', 'calendar'] as const),
  action: Type.String({ description: 'Google service action, e.g. list, search, events, create.' }),
  args: Type.Optional(Type.Array(Type.String(), {
    description: 'Additional positional arguments and flags, in CLI token order.',
  })),
});

type GoogleToolParamsValue = Static<typeof GoogleToolParams>;

function buildStructuredArgs(params: GoogleToolParamsValue): string[] {
  return [params.service, params.action, ...(params.args ?? [])];
}

function toCliContext(context: unknown): GoogleCliContext | undefined {
  if (!context || typeof context !== 'object') return undefined;

  const candidate = context as Partial<GoogleCliContext>;
  if (
    typeof candidate.workspaceId !== 'string' ||
    !candidate.workspaceManager ||
    !candidate.containerManager
  ) {
    return undefined;
  }

  return {
    workspaceId: candidate.workspaceId,
    workspaceManager: candidate.workspaceManager,
    containerManager: candidate.containerManager,
  };
}

function renderGoogleToolResultText(output: string): string {
  const trimmed = output.trim();
  return trimmed.length > 120 ? `${trimmed.slice(0, 120)}…` : trimmed;
}

export function createGoogleCliTool(): GoogleCliToolDefinition {
  return {
    name: 'google',
    label: 'Google Workspace',
    description:
      'Google Workspace CLI parity tool. Preserves `sero google ...` auth, Gmail, and Calendar commands.',
    parameters: GoogleToolParams,

    async execute(_toolCallId, params) {
      const parsed = params as GoogleToolParamsValue;
      const result = await handleGoogleCliCommand(buildStructuredArgs(parsed));
      return result.exitCode === 0
        ? textToolResult(
            result.output,
            result.details && typeof result.details === 'object'
              ? result.details as Record<string, unknown>
              : {},
          )
        : errorToolResult(
            result.output.replace(/^ERROR:\s*/u, ''),
            result.details && typeof result.details === 'object'
              ? result.details as Record<string, unknown>
              : {},
          );
    },

    renderCall(args, theme) {
      const parsed = args as GoogleToolParamsValue;
      let text = theme.fg('toolTitle', theme.bold('google '));
      text += theme.fg('muted', `${parsed.service} ${parsed.action}`);
      if (Array.isArray(parsed.args) && parsed.args.length > 0) {
        text += ` ${theme.fg('dim', parsed.args.join(' '))}`;
      }
      return new Text(text, 0, 0);
    },

    renderResult(result, _options, theme) {
      const first = result.content[0];
      const msg = first?.type === 'text' ? first.text : '';
      const short = renderGoogleToolResultText(msg);
      return new Text(
        msg.startsWith('Error:') ? theme.fg('error', short) : theme.fg('success', '✓ ') + theme.fg('muted', short),
        0,
        0,
      );
    },

    cli: {
      summary: GOOGLE_CLI_SUMMARY,
      help: GOOGLE_CLI_HELP,
      group: 'Google',
      overrideBuiltin: true,
      execute: async (args, context) => handleGoogleCliCommand(args, toCliContext(context)),
    },
  };
}

export function registerGoogleCliTool(pi: ExtensionAPI): void {
  pi.registerTool(createGoogleCliTool());
}
