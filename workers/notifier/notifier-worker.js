export default {
  async fetch(request, env) {
    return new Response("Noticeboard reminder trigger Worker is alive.");
  },

  async scheduled(controller, env, ctx) {
    const url =
      `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}` +
      `/actions/workflows/${env.GITHUB_WORKFLOW}/dispatches`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "Cloudflare-Noticeboard-Reminder-Worker",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ref: "main",
      }),
    });

    const text = await response.text();

    console.log("GitHub status:", response.status);
    console.log("GitHub response:", text);

    if (!response.ok) {
      throw new Error(
        `GitHub workflow dispatch failed: ${response.status} ${text}`
      );
    }

    console.log("GitHub workflow dispatched successfully.");
  },
};
