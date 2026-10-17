const CACHE = 'cai-v1'
const STATIC = ['/', '/trade-calls', '/review', '/tester']

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(STATIC)).catch(() => {})
  )
  self.skipWaiting()
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url)
  // API calls: network only (never cache)
  if (url.pathname.startsWith('/api/')) return
  // Static assets: stale-while-revalidate
  e.respondWith(
    caches.match(e.request).then(cached => {
      const fresh = fetch(e.request).then(res => {
        if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone())).catch(() => {})
        return res
      }).catch(() => cached)
      return cached || fresh
    })
  )
})
