// GitHub OAuth via a Cloudflare Worker proxy.
// Config reused from the original fit.mi app — same GitHub OAuth App, same
// worker, same allowlist. The callback URL for GitHub Pages
// (https://bovmii.github.io/fitmi-v2/) must be registered in the OAuth app.

const AUTH_CONFIG = {
  clientId: 'Ov23lilWpiYpbnJaIm1w',
  workerUrl: 'https://github-auth-proxy.boumi311.workers.dev',
  redirectUri: window.location.origin + window.location.pathname,
  allowedUsers: ['bovmii'],
};

export const Auth = {
  isAuthenticated() {
    const session = JSON.parse(localStorage.getItem('auth_session') || 'null');
    return session && AUTH_CONFIG.allowedUsers.includes(session.login);
  },

  getUser() {
    return JSON.parse(localStorage.getItem('auth_session') || 'null');
  },

  login() {
    const params = new URLSearchParams({
      client_id: AUTH_CONFIG.clientId,
      redirect_uri: AUTH_CONFIG.redirectUri,
      scope: 'read:user',
    });
    window.location.href = `https://github.com/login/oauth/authorize?${params}`;
  },

  async handleCallback() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (!code) return false;
    try {
      const res = await fetch(AUTH_CONFIG.workerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (data.error || !AUTH_CONFIG.allowedUsers.includes(data.login)) return false;
      // Only persist what the UI actually needs — dropped access_token
      // compared to the legacy apps since no authenticated GitHub API call
      // is made from the client.
      localStorage.setItem('auth_session', JSON.stringify({
        login: data.login,
        avatar_url: data.avatar_url,
        name: data.name,
      }));
      window.history.replaceState({}, '', window.location.pathname);
      return true;
    } catch {
      return false;
    }
  },

  logout() {
    localStorage.removeItem('auth_session');
    window.location.reload();
  },
};
