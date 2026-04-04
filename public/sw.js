const CACHE = 'ss-eval-v1';
const STATIC = [
  '/evaluator/score',
  '/_next/static',
];

// On install — cache nothing yet, wait for evaluator to open a session
self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const { request } = e;
  const url = new URL(request.url);

  // Score POSTs: if offline return synthetic 200 so the UI never errors
  // The page already saves to localStorage first — this just keeps fetch clean
  if (request.method === 'POST' && url.pathname === '/api/evaluator/scores') {
    e.respondWith(
      fetch(request).catch(() =>
        new Response(JSON.stringify({ ok: true, offline: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );
    return;
  }

  // Session data + scoring categories: network first, cache fallback
  // This is what lets the scoring page work after wifi drops mid-session
  if (
    request.method === 'GET' && (
      url.pathname.startsWith('/api/checkin/') ||
      url.pathname.includes('/setup') ||
      url.pathname === '/api/evaluator/status'
    )
  ) {
    e.respondWith(
      fetch(request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(request, clone));
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Page navigation + Next.js static assets: network first, cache fallback
  if (request.method === 'GET' && (request.mode === 'navigate' || url.pathname.startsWith('/_next/'))) {
    e.respondWith(
      fetch(request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(request, clone));
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }
});

// Precache message: scoring page sends specific URLs to cache while online
// Fires when evaluator opens their session - caches exactly what they need
self.addEventListener('message', e => {
  if (e.data?.type !== 'PRECACHE') return;
  const urls = e.data.urls || [];
  e.waitUntil(
    caches.open('ss-eval-v1').then(cache =>
      Promise.all(
        urls.map(url =>
          fetch(url, { credentials: 'include' })
            .then(res => { if (res.ok) cache.put(url, res); })
            .catch(() => {})
        )
      ).then(() => {
        if (e.source) e.source.postMessage({ type: 'PRECACHE_DONE', urls });
      })
    )
  );
});
