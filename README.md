# Noticeboard

Pin up to 5 reminders, each with its own schedule: once on a specific
date, daily, or weekly on a specific day. A reminder fires automatically
at its scheduled time via a push notification (ntfy). Deleting a
reminder stops its schedule immediately.

Two Cloudflare Workers do the work, mirroring the supplement tracker's
`notifier` / `supplement-sync` split:

- **`noticeboard-sync`** — holds the GitHub token, proxies reads/writes
  of `data/reminders.json` so the browser never sees the token.
- **`noticeboard-notifier`** — fires every 5 minutes and dispatches the
  GitHub Action that actually checks schedules and sends to ntfy.

## How it fits together

```
index.html (GitHub Pages)
   |  GET/POST reminders
   v
noticeboard-sync (Cloudflare Worker)
   |  reads/writes via GitHub Contents API
   v
data/reminders.json (this repo)


noticeboard-notifier (Cloudflare Worker, Cron Trigger every 5 min)
   |  dispatches
   v
send-notification.yml (GitHub Action, workflow_dispatch)
   |  checks out repo, reads data/reminders.json,
   |  works out what's due (IST), sends to ntfy,
   |  logs sent state in data/notification-log.json, commits it back
   v
your phone
```

- The page only ever talks to `noticeboard-sync` — never to GitHub
  directly, and never holds a GitHub token.
- `noticeboard-notifier` never talks to ntfy itself — its only job is
  to trigger the Action on schedule.
- The Action does the real work: evaluates each reminder's schedule
  against the current time, sends due ones, and tracks "already sent
  today" in `data/notification-log.json` so a daily/weekly reminder
  fires once, not every 5 minutes.
- Deleting a reminder just removes it from `data/reminders.json` via
  `noticeboard-sync` — nothing else reads it after that, so its
  schedule stops right away.

## Repo structure

```
noticeboard/
├── index.html
├── data/
│   └── reminders.json
├── workers/
│   ├── sync/
│   │   ├── sync-worker.js
│   │   └── wrangler.toml
│   └── notifier/
│       ├── notifier-worker.js
│       └── wrangler.toml
└── .github/workflows/
    └── send-notification.yml
```

## Setup

### 1. Repo + Pages
- Push this folder to a new GitHub repo (e.g. `noticeboard`).
- Settings → Pages → deploy from `main`, root folder.
- Add a repository secret `NTFY_TOPIC` (Settings → Secrets and
  variables → Actions) set to your ntfy topic name.

### 2. ntfy
- Install the ntfy app, subscribe to a topic name of your choosing
  (not easily guessable, e.g. `muzz-noticeboard-8f2a`). Use this same
  name for the `NTFY_TOPIC` secret above.

### 3. A GitHub token for the sync worker
- Fine-grained PAT, scoped to this repo only, **Contents: Read and
  write**.

### 4. Deploy `noticeboard-sync`
```bash
cd workers/sync
npm install -g wrangler   # if not already installed
wrangler login
```
Edit `wrangler.toml`: set `GITHUB_OWNER` to your username.
```bash
wrangler secret put GITHUB_TOKEN   # the token from step 3
wrangler secret put SYNC_PIN       # make up a short PIN, e.g. 0907
wrangler deploy
```
Note the URL it prints (`https://noticeboard-sync.<you>.workers.dev`).

### 5. Connect the page
- Open your GitHub Pages URL, click the gear icon.
- The Worker URL is pre-filled with the default — only change it if you
  deployed under a different name.
- Enter the PIN you set in step 4, save.
- You can now pin and delete reminders — the PIN is stored in that
  browser's localStorage and sent only to your Worker URL; the real
  GitHub token never leaves the Worker. Repeat this step (PIN only, URL
  is already defaulted) on each new device.

### 6. A second GitHub token for the notifier worker
- Another fine-grained PAT, scoped to this repo, **Actions: Read and
  write** — this is what lets it dispatch the workflow.

### 7. Deploy `noticeboard-notifier`
```bash
cd workers/notifier
```
Edit `wrangler.toml`: set `GITHUB_OWNER` to your username.
```bash
wrangler secret put GITHUB_TOKEN   # the token from step 6
wrangler deploy
```
The cron trigger starts firing automatically once deployed.

### 8. Test it
- Pin a reminder for a couple of minutes from now.
- Wait for the next 5-minute tick (or check the repo's Actions tab to
  confirm the workflow runs). You should get a push via ntfy.

## Notes

- Times are evaluated in IST (`Asia/Kolkata`) — change the `TZ` value
  in `send-notification.yml` if you need a different timezone.
- The sync worker checks a PIN (`SYNC_PIN`) before reading or writing —
  anyone without it can't touch your reminders, even with the Worker URL.
- The notifier worker has no auth — it only responds "alive" over HTTP
  and does everything else on its own cron schedule, so there's nothing
  for an outsider to trigger.
