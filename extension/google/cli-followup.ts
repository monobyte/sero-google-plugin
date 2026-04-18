import type {
  GoogleCliContext,
  GoogleCliResult,
} from './cli-types';

export async function emitGoogleCliFollowUp(
  result: GoogleCliResult,
  context?: GoogleCliContext,
): Promise<void> {
  const output = result.output.trim();
  if (!context?.sessionRuntime || context.access !== 'agent' || result.exitCode !== 0 || !output) {
    return;
  }

  await context.sessionRuntime.sendMessage(
    {
      customType: '',
      content: [{ type: 'text', text: output }],
      display: true,
      details: result.details,
    },
    { triggerTurn: false, deliverAs: 'followUp' },
  );
}
