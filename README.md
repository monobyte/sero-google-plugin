# Google for Sero

Bring Gmail and Google Calendar into Sero.

With this plugin, you can:
- read and search your email from the Google app in Sero
- view your calendar and upcoming events
- ask the agent to work with your inbox or schedule
- use `sero google ...` in the terminal when you want direct command-line control

Under the hood, the plugin uses
[gogcli](https://github.com/steipete/gogcli), but you do **not** need to learn
its internals to use the app.

## What you need

Before installing the plugin, make sure you have:

1. **Sero** installed
2. **gogcli** installed on your Mac
3. **Google OAuth credentials** for Gmail + Calendar access

### Install gogcli

```bash
brew install steipete/tap/gogcli
```

That installs the `gog` command the plugin uses to talk to Google.

## Install the plugin

In **Sero → Admin → Plugins**, install:

```text
git:https://github.com/monobyte/sero-google-plugin.git
```

Sero will clone the repo, install dependencies, build it, and add **Google** to
your sidebar.

## Set up Google access

### Step 1: Create Google OAuth credentials

In Google Cloud Console:

1. Create a project at <https://console.cloud.google.com/>
2. Enable the **Gmail API**
3. Enable the **Google Calendar API**
4. Create an **OAuth 2.0 Client ID** for a **Desktop app**

You’ll get:
- a **Client ID**
- a **Client Secret**

### Step 2: Add those credentials to Sero

The easiest path is inside the app itself:

1. Open the **Google** app in Sero
2. If Google isn’t configured yet, you’ll see a setup form
3. Paste your **Client ID** and **Client Secret**
4. Save

Then click **Sign in with Google** and complete the browser flow.

That’s the recommended setup for most users.

### Optional: configure credentials with environment variables

If you prefer, you can provide the same credentials through environment vars:

```env
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
```

## Everyday use

Once you’re signed in, you can use Google in three ways.

### 1) The Google app in Sero

The plugin adds a **Google** app with:
- **Mail** for inbox and thread reading
- **Calendar** for events and schedule browsing

This is the best place to:
- connect or reconnect your Google account
- browse email threads
- check your schedule
- refresh Gmail and Calendar state

### 2) Ask the agent

Once authenticated, you can ask Sero things like:

- “Show me recent unread emails from Alex”
- “Summarize today’s calendar”
- “Draft a reply to the latest thread from Finance”
- “What meetings do I have this afternoon?”

The plugin keeps the app UI and agent-driven Google actions in sync, so what
you do in chat and what you see in the UI stay aligned.

### 3) Use the terminal

The plugin preserves the public Google CLI in Sero:

```bash
sero google gmail search 'newer_than:1d'
sero google gmail thread <thread-id>
sero google calendar events primary --today
sero google calendar create primary --summary "Standup" --from 9:00 --to 9:30
```

If you like terminal workflows, this gives you direct control while still using
the same authenticated Google account as the app.

## Common terminal commands

### Gmail

```bash
sero google gmail search 'from:boss newer_than:3d'
sero google gmail thread <thread-id>
sero google gmail send --to user@example.com --subject "Hi" --body "Hello"
```

### Calendar

```bash
sero google calendar calendars
sero google calendar events primary --today
sero google calendar search "dentist"
```

## Advanced: account management

Most people should use the in-app **Sign in with Google** flow.

The plugin also supports terminal auth management commands for setup,
inspection, or recovery:

```bash
sero google auth status
sero google auth list
sero google auth add you@example.com
sero google auth credentials /path/to/credentials.json
```

These commands are mainly for **operators / power users**. In normal agent chat
flows, auth-management commands are intentionally treated as operator-facing,
while Gmail and Calendar actions remain agent-friendly.

## Profiles

Google sign-in is **profile-scoped** in Sero.

That means if you use multiple Sero profiles, each profile keeps its own Google
account context. Your work profile and personal profile stay isolated.

In normal use, you usually do **not** need to pass `--account`. The plugin will
resolve the active authenticated account automatically for Gmail and Calendar
commands.

## Container-backed workspaces

If you use container-backed workspaces, Google commands still work.

Current behavior:
- the plugin tries the workspace container first
- if `gog` is not available in the shipped container image, it falls back to
  the host automatically

So in practice, the important requirement is simple:

**Install gogcli on the host machine.**

After signing in, these should work in both normal and container-backed
workspaces:

```bash
sero google gmail search 'newer_than:1d'
sero google calendar events primary --today
```

## Troubleshooting

### “Google OAuth not configured”

You haven’t added your Client ID and Client Secret yet.

Fix:
- open the Google app in Sero
- paste your OAuth credentials into the setup form
- save and try again

### “gog not found”

The plugin can’t find gogcli.

Fix:

```bash
brew install steipete/tap/gogcli
```

### I signed in, but commands ask for auth again

Try these in order:
1. Open the Google app and sign in again
2. Run `sero google auth status`
3. If needed, re-import credentials or add the account again from the terminal

## For Pi users

You can also install this as a Pi package:

```bash
pi install git:https://github.com/monobyte/sero-google-plugin.git
```

That exposes these tools:
- `google`
- `gmail`
- `gcal`

And these slash commands:
- `/gmail`
- `/gcal`

## Data and state

The plugin keeps Google app state in a file-backed store so the Sero UI and
agent stay in sync.

In Sero, that state lives under:

```text
$SERO_HOME/apps/google/state.json
```

You usually do not need to touch this file manually.
