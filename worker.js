// Original Sparrow Love Edit frontend route mapping, copied from app/main.py.
// Backend APIs deliberately return 503 until Sparrow's real FastAPI server is deployed.
// The retired Cartoon Studio is not served.
const STATIC_ROUTES = Object.freeze({
  '/': '/index.html',
  '/studio': '/index.html',
  '/payment-return': '/index.html',
  '/film': '/film.html',
  '/ecosystem': '/ecosystem.html',
  '/ecosystem/stream': '/live-stream.html',
  '/ecosystem/book': '/booking.html',
  '/flight-travels': '/aviation.html',
  '/ecosystem/flights': '/aviation.html',
  '/ecosystem/map': '/home-map.html',
});

function jsonError(status, code, message) {
  return new Response(JSON.stringify({error: code, message}), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname.replace(/\/+$/, '') || '/';
    if (p === '/cartoon' || p.startsWith('/cartoon/')) {
      return jsonError(410, 'retired', 'Cartoon Studio has been retired.');
    }
    if (p.startsWith('/api/') || p === '/api' || p === '/health' || p.startsWith('/auth/')) {
      return jsonError(503, 'backend_not_deployed', 'The original Sparrow FastAPI backend is not available on Cloudflare Free.');
    }
    if (p === '/ecosystem/live') {
      return jsonError(503, 'component_unavailable', 'The original Live Map frontend asset is not available in this deployment.');
    }
    if (p === '/factory') {
      return Response.redirect(new URL('/film#factory-floor', url), 307);
    }
    if (p === '/template' || p.startsWith('/template/')) {
      // Existing verified Next.js editor remains on Vercel; it is NOT moved to Cloudflare yet.
      const target = new URL(p + url.search, 'https://sparrow-yc-public-demo.vercel.app');
      return Response.redirect(target, 307);
    }
    const assetPath = STATIC_ROUTES[p] || url.pathname;
    const assetUrl = new URL(url);
    assetUrl.pathname = assetPath;
    return env.ASSETS.fetch(new Request(assetUrl.toString(), request));
  }
};
