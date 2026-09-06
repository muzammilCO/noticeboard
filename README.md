# Noticeboard

Pin up to 5 reminders, each with its own schedule: once on a specific
date, daily, or weekly on a specific day. A reminder fires automatically
at its scheduled time via a push notification (ntfy). Deleting a
reminder stops its schedule immediately — nothing else reads it once
it's gone.

## How it fits together

```
index.html (GitHub Pages)
   |  create / delete reminders
   v
data/reminders.json (this repo, via GitHub Contents API)

Cloudflare Cron Trigger (every 5 minutes)
   |
   v
worker.js  --dispatches-->  send-notification.yml (workflow_dispatch)
                                  |
                            checks out repo, reads data/reminders.json,
                            works out which reminders are due (IST),
                            sends due ones to ntfy, records that in
                            data/notification-log.json, commits it back
                                  |
                                  v
                             your phone
```

- The web page only creates and deletes reminders. It never triggers a
  send itself.
- The Cloudflare Worker's only job is to dispatch the GitHub Action, on a
  5-minute schedule (and on-demand via `/send`, for testing).
- The Action does the real work: reads the reminders, checks each one's
  schedule against the current time in IST, and sends any that are due
  and haven't already been sent today.
- `data/notification-log.json` is what prevents a daily/weekly reminder
  from re-firing every 5 minutes for the rest of the day — it's written
  only by the Action, never by the page.

## Reminder schedule types

- **Once** — fires on a specific date, at a specific time.
- **Daily** — fires every day at a specific time.
- **Weekly** — fires on a specific day of the week, at a specific time.

Deleting a reminder from the board removes it from `data/reminders.json`
entirely, so it's no longer read by the Action and stops firing right
away — the schedule doesn't need separate cleanup.

## 1. Set up the repo

1. Push this folder to a new GitHub repo (e.g. `noticeboard`).
2. Enable GitHub Pages for it (Settings → Pages → deploy from the `main`
   branch, root folder). Your board will be live at
   `https://<you>.github.io/noticeboard/`.
3. `data/reminders.json` starts as an empty list — the page maintains it.
4. Add a repository secret `NTFY_TOPIC` (Settings → Secrets and variables
   → Actions) set to your ntfy topic name.

## 2. Create a GitHub token for the page to use

A fine-grained PAT scoped to this repo, with **Contents: Read and
write**. Paste it into the board's settings panel — it's stored only in
that browser's localStorage.

## 3. Create a second GitHub token for the Worker

Another fine-grained PAT scoped to this repo, with **Actions: Read and
write** — this is what lets the Worker dispatch the workflow.

## 4. Set up ntfy

Install the [ntfy app](https://ntfy.sh/) and subscribe to a topic name of
your choosing (pick something not easily guessable, e.g.
`muzz-noticeboard-8f2a`). Use the same name for the `NTFY_TOPIC` secret
above.

## 5. Deploy the Cloudflare Worker

```bash
npm install -g wrangler
wrangler login
```

Edit `wrangler.toml` with your GitHub owner/repo, then:

```bash
wrangler secret put GITHUB_TOKEN   # the Actions:read/write PAT from step 3
wrangler deploy
```

The `[triggers]` cron in `wrangler.toml` starts firing automatically
once deployed — no extra step needed.

## Notes

- The Worker's `/send` endpoint has no auth — fine for a personal tool,
  but add a shared-secret check if that matters to you.
- Times are evaluated in IST (`Asia/Kolkata`). Change the `TZ` value in
  the workflow if you need a different timezone.
