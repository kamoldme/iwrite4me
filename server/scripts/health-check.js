// Used by container orchestration; the runtime image has Node but no curl/wget.
const port = Number(process.env.PORT) || 3000;
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 5000);
fetch(`http://127.0.0.1:${port}/api/health`, { signal: controller.signal })
  .then(async response => {
    const body = await response.json();
    if (!response.ok || body.status !== 'ok') process.exitCode = 1;
  })
  .catch(() => { process.exitCode = 1; })
  .finally(() => clearTimeout(timeout));
