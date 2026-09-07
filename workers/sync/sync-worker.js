/**
 * Noticeboard sync proxy.
 *
 * Holds your GitHub token as a Worker secret (never sent to the browser).
 * Every device authenticates with a short PIN instead — the PIN is checked
 * here, and only if it matches does this Worker touch GitHub on your
 * behalf. Set up once per device: paste the Worker URL and PIN, never the
 * long GitHub token.
 *
 * Required environment variables (set as Secrets/vars in the Cloudflare
 * dashboard or wrangler.toml):
 *   GITHUB_TOKEN   - fine-grained PAT scoped to this one repo, Contents: Read and write (secret)
 *   GITHUB_OWNER   - your GitHub username/org, e.g. "muzz123"
 *   GITHUB_REPO    - the repo name, e.g. "noticeboard"
 *   GITHUB_PATH    - the data file this proxy is allowed to touch, e.g. "data/reminders.json"
 *   GITHUB_BRANCH  - usually "main"
 *   SYNC_PIN       - a short string/number you make up, e.g. "0907" (secret)
 *
 * GET  ?pin=<pin>              -> returns the current reminders array ([] if the file doesn't exist yet)
 * POST { pin, reminders: [] }  -> replaces the file's contents with the given array
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const branch = env.GITHUB_BRANCH || 'main';
    const apiUrl = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${env.GITHUB_PATH}`;
    const ghHeaders = {
      Authorization: `token ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'noticeboard-sync-worker',
    };

    if (request.method === 'GET') {
      const url = new URL(request.url);
      const pin = url.searchParams.get('pin');
      if (!env.SYNC_PIN || pin !== env.SYNC_PIN) {
        return json({ ok: false, error: 'Invalid PIN' }, 401);
      }

      const getRes = await fetch(`${apiUrl}?ref=${branch}`, { headers: ghHeaders });
      if (getRes.status === 404) {
        return json([]);
      }
      if (!getRes.ok) {
        return json({ ok: false, error: `GitHub read failed (${getRes.status})` }, 502);
      }
      const existing = await getRes.json();
      const content = base64Decode(existing.content);
      return new Response(content, { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    if (request.method === 'POST') {
      let body;
      try {
        body = await request.json();
      } catch (e) {
        return json({ ok: false, error: 'Invalid JSON body' }, 400);
      }

      const { pin, reminders } = body;
      if (!env.SYNC_PIN || pin !== env.SYNC_PIN) {
        return json({ ok: false, error: 'Invalid PIN' }, 401);
      }
      if (!Array.isArray(reminders)) {
        return json({ ok: false, error: 'Missing reminders array' }, 400);
      }

      try {
        let sha;
        const getRes = await fetch(`${apiUrl}?ref=${branch}`, { headers: ghHeaders });
        if (getRes.ok) {
          const existing = await getRes.json();
          sha = existing.sha;
        }

        const encoded = base64Encode(JSON.stringify(reminders, null, 2));
        const putRes = await fetch(apiUrl, {
          method: 'PUT',
          headers: { ...ghHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: `Update reminders (${reminders.length} pinned)`,
            content: encoded,
            sha,
            branch,
          }),
        });

        if (!putRes.ok) {
          const err = await putRes.json().catch(() => ({}));
          return json({ ok: false, error: err.message || putRes.statusText }, 502);
        }
        return json({ ok: true });
      } catch (e) {
        return json({ ok: false, error: e.message }, 500);
      }
    }

    return json({ ok: false, error: 'Method not allowed' }, 405);
  },
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function base64Encode(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary);
}

function base64Decode(b64) {
  const binary = atob(b64.replace(/\n/g, ''));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
}
