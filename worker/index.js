const CANONICAL_HOST = "outback.q5m.ai";
const REDIRECT_HOSTS = new Set(["outback.q5m.io"]);

export default {
  fetch(request, env) {
    const url = new URL(request.url);
    if (REDIRECT_HOSTS.has(url.hostname)) {
      url.hostname = CANONICAL_HOST;
      return Response.redirect(url.toString(), 301);
    }
    return env.ASSETS.fetch(request);
  },
};
