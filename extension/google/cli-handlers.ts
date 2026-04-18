import { guardGoogleCliService } from './cli-access';
import { formatGoogleCliResult } from './cli-output';
import { extractAccount, fail } from './cli-helpers';
import {
  GOG_AUTH_TIMEOUT_MS,
  gogResultToCliResult,
  runGoogleCliGog,
} from './cli-runtime';
import type {
  GoogleCliContext,
  GoogleCliExecutionOptions,
  GoogleCliResult,
} from './cli-types';

export const GOOGLE_CLI_SUMMARY = 'Google Workspace commands — Gmail, Calendar, auth (via gogcli)';
export const GOOGLE_CLI_HELP =
  'google — Google Workspace (powered by gogcli)\n\n' +
  'Usage: sero google <service> <action> [args] [--flags]\n\n' +
  'Services:\n' +
  '  auth                          Account authentication\n' +
  '    credentials <path>          Import OAuth client credentials\n' +
  '    add <email>                 Authorize a Google account\n' +
  '    remove <email>              Remove account\n' +
  '    list [--check]              List authorized accounts\n' +
  '    status                      Show auth status\n' +
  '    services                    Show available services\n' +
  '    alias set|list|unset        Manage account aliases\n\n' +
  '  gmail                         Email operations\n' +
  '    search \'<query>\' [--max N]  Search emails\n' +
  '    get <messageId>             Read a message\n' +
  '    thread <threadId>           Read a thread\n' +
  '    send [flags]                Send an email\n' +
  '    labels list|modify|create   Manage labels\n' +
  '    drafts list|create|send     Manage drafts\n' +
  '    url <threadId>              Get web URL\n\n' +
  '  calendar                      Calendar operations\n' +
  '    calendars                   List calendars\n' +
  '    events [calId] [--today]    List events\n' +
  '    search "<query>"            Search events\n' +
  '    event <calId> <eventId>     Get event details\n' +
  '    create <calId> [flags]      Create event\n' +
  '    update <calId> <eId> [fl.]  Update event\n' +
  '    delete <calId> <eventId>    Delete event\n' +
  '    respond <calId> <eId> [fl.] RSVP to invitation\n' +
  '    freebusy [flags]            Check availability\n' +
  '    conflicts [flags]           Show conflicts\n\n' +
  'Global flags:\n' +
  '  --account <email|alias>       Select Google account\n\n' +
  'Examples:\n' +
  '  sero google auth list\n' +
  '  sero google gmail search \'from:boss newer_than:1d\'\n' +
  '  sero google gmail send --to user@example.com --subject "Hi" --body "Hello"\n' +
  '  sero google calendar events primary --today\n' +
  '  sero google calendar create primary --summary "Standup" --from 9:00 --to 9:30\n';

async function executeGoogleCli(
  service: string,
  action: string,
  gogArgs: string[],
  context: GoogleCliContext | undefined,
  options: {
    account?: string;
    json?: boolean;
    timeoutMs?: number;
    noInput?: boolean;
  } = {},
): Promise<GoogleCliResult> {
  const result = await runGoogleCliGog(gogArgs, context, options);
  return options.json === true
    ? formatGoogleCliResult(service, action, result)
    : gogResultToCliResult(result);
}

async function handleGoogleAuth(args: string[], context?: GoogleCliContext): Promise<GoogleCliResult> {
  const [action, ...rest] = args;
  if (!action) {
    return fail(
      'Usage: sero google auth <action>\n\n' +
      'Actions:\n' +
      '  credentials <path>     Import OAuth client credentials JSON\n' +
      '  add <email>            Authorize a Google account\n' +
      '  remove <email>         Remove an authorized account\n' +
      '  list [--check]         List authorized accounts\n' +
      '  status                 Show auth status and services\n' +
      '  services               Show available Google services\n' +
      '  alias set <n> <email>  Set an account alias\n' +
      '  alias list             List aliases\n' +
      '  alias unset <name>     Remove an alias',
    );
  }

  const { cleaned, account } = extractAccount(rest);

  switch (action) {
    case 'credentials': {
      const credentialsPath = cleaned[0];
      if (!credentialsPath) return fail('Usage: sero google auth credentials <path-to-credentials.json>');
      return gogResultToCliResult(
        await runGoogleCliGog(['auth', 'credentials', credentialsPath], context, {
          account,
          timeoutMs: GOG_AUTH_TIMEOUT_MS,
        }),
      );
    }

    case 'add': {
      const email = cleaned[0];
      if (!email) return fail('Usage: sero google auth add <email>');
      return gogResultToCliResult(
        await runGoogleCliGog(['auth', 'add', email, ...cleaned.slice(1)], context, {
          account,
          timeoutMs: GOG_AUTH_TIMEOUT_MS,
          noInput: false,
        }),
      );
    }

    case 'remove': {
      const email = cleaned[0];
      if (!email) return fail('Usage: sero google auth remove <email>');
      return gogResultToCliResult(
        await runGoogleCliGog(['auth', 'remove', email, '--force'], context, {
          account,
          timeoutMs: GOG_AUTH_TIMEOUT_MS,
        }),
      );
    }

    case 'list':
      return gogResultToCliResult(
        await runGoogleCliGog(['auth', 'list', ...cleaned], context, { account }),
      );

    case 'status':
      return gogResultToCliResult(
        await runGoogleCliGog(['auth', 'status'], context, { account }),
      );

    case 'services':
      return gogResultToCliResult(
        await runGoogleCliGog(['auth', 'services'], context, { account }),
      );

    case 'alias': {
      const [aliasAction, ...aliasRest] = cleaned;
      if (!aliasAction || !['set', 'list', 'unset'].includes(aliasAction)) {
        return fail('Usage: sero google auth alias <set|list|unset> [args]');
      }
      return gogResultToCliResult(
        await runGoogleCliGog(['auth', 'alias', aliasAction, ...aliasRest], context, { account }),
      );
    }

    default:
      return fail(`Unknown auth action: ${action}. Run "sero google auth" for usage.`);
  }
}

async function handleGoogleGmail(args: string[], context?: GoogleCliContext): Promise<GoogleCliResult> {
  const [action, ...rest] = args;
  if (!action) {
    return fail(
      'Usage: sero google gmail <action>\n\n' +
      'Actions:\n' +
      '  search \'<query>\' [--max N]  Search emails\n' +
      '  get <messageId>             Get a message\n' +
      '  thread <threadId>           Get a thread\n' +
      '  send [flags]                Send an email\n' +
      '  labels list                 List labels\n' +
      '  labels modify <threadId>    Modify thread labels\n' +
      '  drafts list                 List drafts\n' +
      '  drafts create [flags]       Create a draft\n' +
      '  drafts send <draftId>       Send a draft\n' +
      '  url <threadId>              Get web URL for thread',
    );
  }

  const { cleaned, account } = extractAccount(rest);

  switch (action) {
    case 'search': {
      const query = cleaned[0];
      if (!query) return fail('Usage: sero google gmail search \'<query>\' [--max N]');
      return executeGoogleCli('gmail', 'search', ['gmail', 'search', query, ...cleaned.slice(1)], context, {
        json: true,
        account,
      });
    }

    case 'get': {
      const messageId = cleaned[0];
      if (!messageId) return fail('Usage: sero google gmail get <messageId>');
      return executeGoogleCli('gmail', 'get', ['gmail', 'get', messageId, ...cleaned.slice(1)], context, {
        json: true,
        account,
      });
    }

    case 'thread': {
      const threadId = cleaned[0];
      if (!threadId) return fail('Usage: sero google gmail thread <threadId>');
      return executeGoogleCli('gmail', 'thread', ['gmail', 'thread', 'get', threadId, ...cleaned.slice(1)], context, {
        json: true,
        account,
      });
    }

    case 'send': {
      if (cleaned.length === 0) {
        return fail(
          'Usage: sero google gmail send --to <email> --subject "<s>" --body "<b>"\n' +
          '       sero google gmail send --reply-to-message-id <id> --body "<b>" [--quote]',
        );
      }
      return gogResultToCliResult(
        await runGoogleCliGog(['gmail', 'send', ...cleaned], context, {
          json: true,
          account,
        }),
      );
    }

    case 'labels': {
      const [labelAction, ...labelRest] = cleaned;
      if (!labelAction) return fail('Usage: sero google gmail labels <list|modify|create|delete>');

      switch (labelAction) {
        case 'list':
          return executeGoogleCli('gmail', 'labels', ['gmail', 'labels', 'list', ...labelRest], context, {
            json: true,
            account,
          });
        case 'modify':
          if (!labelRest[0]) {
            return fail('Usage: sero google gmail labels modify <threadId> --add <label> --remove <label>');
          }
          return gogResultToCliResult(
            await runGoogleCliGog(['gmail', 'labels', 'modify', ...labelRest], context, {
              json: true,
              account,
            }),
          );
        case 'create':
          if (!labelRest[0]) return fail('Usage: sero google gmail labels create "<name>"');
          return gogResultToCliResult(
            await runGoogleCliGog(['gmail', 'labels', 'create', ...labelRest], context, {
              json: true,
              account,
            }),
          );
        case 'delete':
          if (!labelRest[0]) return fail('Usage: sero google gmail labels delete <labelId>');
          return gogResultToCliResult(
            await runGoogleCliGog(['gmail', 'labels', 'delete', ...labelRest], context, { account }),
          );
        default:
          return fail(`Unknown labels action: ${labelAction}. Use: list, modify, create, delete`);
      }
    }

    case 'drafts': {
      const [draftAction, ...draftRest] = cleaned;
      if (!draftAction) return fail('Usage: sero google gmail drafts <list|create|send>');

      switch (draftAction) {
        case 'list':
          return executeGoogleCli('gmail', 'drafts', ['gmail', 'drafts', 'list', ...draftRest], context, {
            json: true,
            account,
          });
        case 'create':
          return gogResultToCliResult(
            await runGoogleCliGog(['gmail', 'drafts', 'create', ...draftRest], context, {
              json: true,
              account,
            }),
          );
        case 'send': {
          const draftId = draftRest[0];
          if (!draftId) return fail('Usage: sero google gmail drafts send <draftId>');
          return gogResultToCliResult(
            await runGoogleCliGog(['gmail', 'drafts', 'send', ...draftRest], context, {
              json: true,
              account,
            }),
          );
        }
        default:
          return fail(`Unknown drafts action: ${draftAction}. Use: list, create, send`);
      }
    }

    case 'url': {
      const threadId = cleaned[0];
      if (!threadId) return fail('Usage: sero google gmail url <threadId>');
      return gogResultToCliResult(
        await runGoogleCliGog(['gmail', 'url', threadId], context, { account }),
      );
    }

    default:
      return fail(`Unknown gmail action: ${action}. Run "sero google gmail" for usage.`);
  }
}

async function handleGoogleCalendar(args: string[], context?: GoogleCliContext): Promise<GoogleCliResult> {
  const [action, ...rest] = args;
  if (!action) {
    return fail(
      'Usage: sero google calendar <action>\n\n' +
      'Actions:\n' +
      '  calendars                       List calendars\n' +
      '  events [calId] [--today|--week] List events\n' +
      '  search "<query>" [--today]      Search events\n' +
      '  event <calId> <eventId>         Get event details\n' +
      '  create <calId> [flags]          Create an event\n' +
      '  update <calId> <eventId> [fl.]  Update an event\n' +
      '  delete <calId> <eventId>        Delete an event\n' +
      '  respond <calId> <eventId> [fl.] Respond to invitation\n' +
      '  freebusy [flags]                Check availability\n' +
      '  conflicts [flags]               Show scheduling conflicts',
    );
  }

  const { cleaned, account } = extractAccount(rest);

  switch (action) {
    case 'calendars':
      return executeGoogleCli('calendar', 'calendars', ['calendar', 'calendars', ...cleaned], context, {
        json: true,
        account,
      });

    case 'events':
      return executeGoogleCli('calendar', 'events', ['calendar', 'events', ...cleaned], context, {
        json: true,
        account,
      });

    case 'search': {
      const query = cleaned[0];
      if (!query) return fail('Usage: sero google calendar search "<query>" [--today|--week|--days N]');
      return executeGoogleCli('calendar', 'search', ['calendar', 'search', query, ...cleaned.slice(1)], context, {
        json: true,
        account,
      });
    }

    case 'event': {
      const calendarId = cleaned[0];
      const eventId = cleaned[1];
      if (!calendarId || !eventId) return fail('Usage: sero google calendar event <calendarId> <eventId>');
      return executeGoogleCli('calendar', 'event', ['calendar', 'event', calendarId, eventId, ...cleaned.slice(2)], context, {
        json: true,
        account,
      });
    }

    case 'create': {
      const calendarId = cleaned[0];
      if (!calendarId) {
        return fail(
          'Usage: sero google calendar create <calendarId> --summary "<title>" --from <time> --to <time>\n' +
          'Options: --attendees "<emails>" --location "<loc>" --description "<desc>"',
        );
      }
      return gogResultToCliResult(
        await runGoogleCliGog(['calendar', 'create', ...cleaned], context, {
          json: true,
          account,
        }),
      );
    }

    case 'update': {
      const calendarId = cleaned[0];
      const eventId = cleaned[1];
      if (!calendarId || !eventId) {
        return fail('Usage: sero google calendar update <calendarId> <eventId> [flags]');
      }
      return gogResultToCliResult(
        await runGoogleCliGog(['calendar', 'update', ...cleaned], context, {
          json: true,
          account,
        }),
      );
    }

    case 'delete': {
      const calendarId = cleaned[0];
      const eventId = cleaned[1];
      if (!calendarId || !eventId) {
        return fail('Usage: sero google calendar delete <calendarId> <eventId>');
      }
      return gogResultToCliResult(
        await runGoogleCliGog(['calendar', 'delete', calendarId, eventId, ...cleaned.slice(2)], context, {
          account,
        }),
      );
    }

    case 'respond': {
      const calendarId = cleaned[0];
      const eventId = cleaned[1];
      if (!calendarId || !eventId) {
        return fail('Usage: sero google calendar respond <calendarId> <eventId> --status accepted|declined|tentative');
      }
      return gogResultToCliResult(
        await runGoogleCliGog(['calendar', 'respond', ...cleaned], context, {
          json: true,
          account,
        }),
      );
    }

    case 'freebusy':
      return gogResultToCliResult(
        await runGoogleCliGog(['calendar', 'freebusy', ...cleaned], context, { json: true, account }),
      );

    case 'conflicts':
      return executeGoogleCli('calendar', 'conflicts', ['calendar', 'conflicts', ...cleaned], context, {
        json: true,
        account,
      });

    default:
      return fail(`Unknown calendar action: ${action}. Run "sero google calendar" for usage.`);
  }
}

export async function handleGoogleCliCommand(
  args: string[],
  context?: GoogleCliContext,
  options?: GoogleCliExecutionOptions,
): Promise<GoogleCliResult> {
  const [service, ...rest] = args;
  if (!service) {
    return fail(
      'Usage: sero google <service> <action> [args]\n\n' +
      'Services:\n' +
      '  auth       Manage Google account authentication\n' +
      '  gmail      Search, read, send, and manage email\n' +
      '  calendar   View, create, and manage calendar events\n\n' +
      'Global flags:\n' +
      '  --account <email|alias>   Select Google account\n\n' +
      'Examples:\n' +
      '  sero google auth list\n' +
      '  sero google gmail search \'newer_than:1d\'\n' +
      '  sero google calendar events primary --today',
    );
  }

  const blockedService = guardGoogleCliService(service, {
    access: options?.access ?? context?.access,
  });
  if (blockedService) {
    return blockedService;
  }

  switch (service) {
    case 'auth':
      return handleGoogleAuth(rest, context);
    case 'gmail':
      return handleGoogleGmail(rest, context);
    case 'calendar':
      return handleGoogleCalendar(rest, context);
    default:
      return fail(`Unknown Google service: ${service}. Available: auth, gmail, calendar`);
  }
}
