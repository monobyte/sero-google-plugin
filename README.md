# @sero-ai/plugin-google

Google Workspace app for Sero — Gmail & Google Calendar integration powered by
[gogcli](https://github.com/steipete/gogcli).

## Sero Plugin Install

Install in **Sero → Admin → Plugins** with:

```text
git:https://github.com/monobyte/sero-google-plugin.git
```

Sero clones the source repo, installs dependencies, builds the UI, and
hot-loads the plugin into the sidebar.

## Pi CLI Usage

Install as a Pi package:

```bash
pi install git:https://github.com/monobyte/sero-google-plugin.git
```

The agent gains three tools — `google`, `gmail`, and `gcal` — plus `/gmail`
and `/gcal` slash commands. Inside Sero, the `google` tool is bridged into the
public `sero google ...` CLI contract so existing auth, Gmail, and Calendar
commands keep working while the plugin owns the behavior. State is stored in
`.sero/apps/google/state.json` relative to the workspace root (or
`$SERO_HOME/apps/google/state.json` when running inside Sero).

## Prerequisites

### gogcli

This plugin requires **gogcli** (`gog`) to be installed on the host machine.
It's a Go CLI that wraps Google's APIs for Gmail and Calendar.

```bash
brew install steipete/tap/gogcli
```

The plugin probes these locations automatically:

- `/opt/homebrew/bin/gog`
- `/usr/local/bin/gog`
- `~/.local/bin/gog`
- `~/go/bin/gog`

For container-backed Sero workspaces, the Google CLI first tries the workspace
container for parity. If `gog` is not installed in the shipped container image,
it falls back to host execution automatically, so `sero google gmail ...` and
`sero google calendar ...` still work as long as gogcli is installed on the
host.

Manual smoke after authenticating in the Google UI:

```bash
sero google gmail search 'newer_than:1d'
sero google calendar events primary --today
```

Those commands should keep working in both host-mode and container-backed
workspaces without requiring an explicit `--account` flag.

### Google OAuth

Google OAuth credentials must be configured for gogcli to authenticate:

1. Create a Google Cloud project at <https://console.cloud.google.com/>
2. Enable the **Gmail API** and **Google Calendar API**
3. Create OAuth 2.0 credentials (Desktop app type)
4. Set the following environment variables in `~/.sero-ui/agent/.env`:

```env
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
```

When using Sero, click **Sign in with Google** in the app UI — this opens
Google's account chooser in your browser and imports the token into gogcli's
keyring.

## Tools

### `gmail`

| Action | Description | Required params |
|--------|-------------|-----------------|
| `search` | Search Gmail threads | `query` (optional, default: `newer_than:3d`) |
| `read_thread` | Read a full email thread | `thread_id` |
| `send` | Send an email | `to`, `subject`, `body` |
| `archive` | Archive a thread (remove INBOX label) | `thread_id` |
| `labels` | List Gmail labels | — |

### `gcal`

| Action | Description | Required params |
|--------|-------------|-----------------|
| `today` | Today's events | — |
| `week` | This week's events | — |
| `search` | Search calendar events | `query` |
| `range` | Fetch events for a date range | `from`, `to` |
| `create` | Create a new event | `summary`, `from`, `to` |
| `delete` | Delete an event | `event_id` |
| `calendars` | List available calendars | — |

## Sero Usage

When loaded in Sero, the web UI mounts in the main app area with a tabbed
layout for **Mail** and **Calendar**. The UI invokes plugin-owned tools via
Sero's generic app-tool bridge and watches the state file for real-time
updates from the agent and the app itself.

The plugin also preserves the public Google CLI surface in Sero:

```bash
sero google auth list
sero google gmail search 'newer_than:1d'
sero google calendar events primary --today
```

Auth-management commands stay operator-facing: use the Google app UI or run
`sero google auth ...` in a terminal when you need to inspect keyring state,
import credentials, or recover OAuth manually. Agent-facing Google command
flows keep Gmail and Calendar parity, but do not expose low-level auth/keyring
operations.

## State File

```
$SERO_HOME/
└── apps/
    └── google/
        └── state.json
```

Contains cached Gmail threads, calendar events, active tab, and account info.
Both the Pi extension tools and the Sero web UI read/write this file.
