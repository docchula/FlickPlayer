// Cloudflare Worker entry. Proxies Firebase Auth helper paths to the project's
// firebaseapp.com domain so authDomain can stay on our own domain (signInWithRedirect).
// Everything else is served from the static Angular build (see wrangler.jsonc).
const FIREBASE_AUTH_HOST = 'keendev-flick-a.firebaseapp.com';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/__/auth/') || url.pathname === '/__/firebase/init.json') {
      url.protocol = 'https:';
      url.hostname = FIREBASE_AUTH_HOST;
      url.port = '';
      // Pass redirects through to the browser instead of following them here.
      return fetch(new Request(url, request), { redirect: 'manual' });
    }

    return env.ASSETS.fetch(request);
  },
};
