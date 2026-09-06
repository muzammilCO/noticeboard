/**
 * Noticeboard worker
 *
 * Runs on a Cloudflare Cron Trigger every 5 minutes (see wrangler.toml).
 * Each firing dispatches the "Send Noticeboard Notification" GitHub
 * Action, which reads data/reminders.json, works out which reminders are
 * due right now (IST), and sends them to ntfy directly.
 *
 * GET/POST /send also dispatches the same Action on demand, for testing.
 *
 * Required environment variables (set the token with
 * `wrangler secret put GITHUB_TOKEN`, the rest in wrangler.toml [vars]):
 *   GITHUB_OWNER         e.g. "your-username"
 *   GITHUB_REPO          e.g. "noticeboard"
 *   GITHUB_WORKFLOW_FILE e.g. "send-notification.yml"
 *   GITHUB_REF           branch to run on, e.g. "main"
 *   GITHUB_TOKEN         fine-grained PAT, Actions: Read and write (secret)
 */

export default {
  async scheduled(event, env, ctx) {
    const res = await dispatch(env);
    console.log(`Scheduled dispatch: ${res.status}`);
  },

  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/send') {
      const res = await dispatch(env);
      if (res.status === 204) {
        return new Response('Triggered the GitHub Action.', { status: 200 });
      }
      const text = await res.text();
      return new Response(`GitHub dispatch failed (${res.status}): ${text}`, { status: 502 });
    }

    return new Response(
      'Noticeboard worker is running. A Cron Trigger fires this every 5 minutes; /send triggers it manually for testing.',
      { status: 200 }
    );
  }
};

function dispatch(env) {
  const dispatchUrl = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/actions/workflows/${env.GITHUB_WORKFLOW_FILE}/dispatches`;

  return fetch(dispatchUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'noticeboard-worker'
    },
    body: JSON.stringify({ ref: env.GITHUB_REF || 'main' })
  });
}
