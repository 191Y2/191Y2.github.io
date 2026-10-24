// ULTRA HOME service worker — v23
// UV fetch + smart asset cache (stale-while-revalidate) for fast games
importScripts('./uv.bundle.js?v=23');
importScripts('./uv.config.js?v=23');
importScripts('./uv.sw.js?v=23');

const sw = new UVServiceWorker();

const ASSET_CACHE = 'ultra-assets-v23';
// content types safe to cache (static stuff — never cache HTML/JSON/API responses)
const CACHEABLE = /(?:text\/css|javascript|ecmascript|image\/|font\/|application\/font|application\/wasm|audio\/)/i;

self.addEventListener('fetch', (event) => {
  event.respondWith(handle(event));
});

async function handle(event) {
  try {
    const req = event.request;
    const url = new URL(req.url);

    // only optimize proxied traffic; everything else straight to UV
    if (!url.pathname.startsWith('/uv/service/')) return await sw.fetch(event);
    if (req.method !== 'GET') return await sw.fetch(event);
    // navigations (the page itself) must always be fresh
    if (req.mode === 'navigate' || req.destination === 'iframe' || req.destination === 'document') {
      return await sw.fetch(event);
    }
    // video/audio streaming uses range requests — never cache those
    if (req.headers && req.headers.get('range')) return await sw.fetch(event);

    const cache = await caches.open(ASSET_CACHE);
    const hit = await cache.match(req, { ignoreSearch: false });
    if (hit) {
      // stale-while-revalidate: instant answer now, refresh in background
      event.waitUntil(revalidate(req, cache).catch(() => {}));
      return hit;
    }

    const resp = await sw.fetch(event);
    if (resp && resp.ok) {
      const ct = resp.headers && resp.headers.get('content-type') || '';
      const len = parseInt(resp.headers && resp.headers.get('content-length') || '0', 10);
      if (CACHEABLE.test(ct) && !(len > 30 * 1024 * 1024)) {
        const copy = resp.clone();
        event.waitUntil(cache.put(req, copy).catch(() => {}));
      }
    }
    return resp;
  } catch (e) {
    try { return await sw.fetch(event); } catch (e2) { return Response.error(); }
  }
}

async function revalidate(req, cache) {
  const fresh = await sw.fetch({ request: req });
  if (fresh && fresh.ok) {
    const ct = fresh.headers && fresh.headers.get('content-type') || '';
    if (CACHEABLE.test(ct)) await cache.put(req, fresh.clone());
  }
}
