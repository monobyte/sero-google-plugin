# Google plugin notification notes

This is the short, plugin-local reference for Gmail background notifications.

For the deeper cross-repo host/runtime playbook, also see:

- `../../sero/@docs/google-plugin-notifications.md`

## Current correct design

### 1. Background polling belongs in the runtime
Use:
- `runtime/index.ts`

The runtime should:
- read the saved inbox query from app state
- poll on the configured interval
- update app state with fresh inbox results
- diff previous vs next thread state
- fire native notifications through the host bridge

Do **not** put background polling or notification decision logic in the React UI.

### 2. Native delivery goes through the runtime host
Use:
- `ctx.host.notifications.notify(...)`

Host implementation lives in Sero desktop:
- `../../sero/apps/desktop/electron/features/apps/runtime/capabilities/create-host.ts`

If notifications seem broken, first confirm the runtime is actually calling this host API.

### 3. Unread state must come from canonical mapping
Use:
- `shared/google-state.ts`

Important detail from `gog gmail search`:
- unread labels may arrive as `labels`, not `labelIds`

The mapper must normalize all supported label shapes into:
- `labelIds: string[]`
- `isUnread: boolean`

If this mapping is wrong, notification logic will silently fail even when host notifications are working.

### 4. Opening a thread must clear unread locally and remotely
Use:
- `extension/index.ts`
- `shared/google-state.ts`

When `read_thread` runs:
- selected thread messages should load
- cached inbox row should be marked read immediately
- Gmail should get a best-effort `--remove UNREAD`

That ensures the blue unread dot disappears immediately and stays gone on next sync.

## Bugs we already hit

### Notifications did not fire
Cause:
- unread state was read from the wrong gog field
- new threads were stored as `isUnread: false`
- runtime correctly decided there was no new unread activity

Fix:
- normalize `thread.labels` in `shared/google-state.ts`

### Unread dot stayed visible after opening a thread
Cause:
- thread detail loaded, but the cached inbox row stayed unread
- Gmail unread label was not being cleared by the read action

Fix:
- clear unread in `applyGmailThreadResult(...)`
- remove `UNREAD` in `gmail read_thread`

## Minimum checks when changing notifications

1. Confirm search result mapping still produces `isUnread: true` for unread mail.
2. Confirm runtime skips first sync but not later unread arrivals.
3. Confirm runtime uses `ctx.host.notifications.notify(...)`.
4. Confirm opening a thread clears the unread dot immediately.
5. Confirm the next sync keeps the thread read.

## Fast manual smoke test

1. Set auto-refresh to `1m`
2. Enable `Notify`
3. Send a fresh unread email
4. Verify desktop notification appears
5. Verify unread dot appears in the inbox list
6. Open the thread
7. Verify unread dot disappears immediately
8. Wait for next sync and verify it stays gone
