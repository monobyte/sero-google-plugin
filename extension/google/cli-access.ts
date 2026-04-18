import { fail } from './cli-helpers';
import type {
  GoogleCliExecutionOptions,
  GoogleCliResult,
} from './cli-types';

export const GOOGLE_AUTH_OPERATOR_ONLY_MESSAGE =
  'Google auth management commands are operator-only. Use the Google app sign-in UI or ask the user to run "sero google auth ..." in a terminal.';

export function getGoogleCliAccess(
  options?: GoogleCliExecutionOptions,
): 'agent' | 'operator' {
  return options?.access ?? 'operator';
}

export function guardGoogleCliService(
  service: string | undefined,
  options?: GoogleCliExecutionOptions,
): GoogleCliResult | null {
  if (service === 'auth' && getGoogleCliAccess(options) === 'agent') {
    return fail(GOOGLE_AUTH_OPERATOR_ONLY_MESSAGE, 1, {
      blocked: true,
      operatorOnly: true,
      service: 'auth',
    });
  }

  return null;
}
