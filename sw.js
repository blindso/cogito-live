/**
 * COGITO 서비스워커 — 재방문 체감 최적화 (M4 후속).
 *
 * 전략(경로별):
 *  - seed-shards/* (샤드·reality-feed): stale-while-revalidate — 재방문은 캐시로 즉시,
 *    백그라운드에서 새 버전 갱신(배포마다 내용이 바뀌므로 cache-first 금지).
 *  - assets/* (해시 파일명): cache-first — 파일명이 내용 해시라 영원히 안전.
 *  - 그 외(index.html 등): network-first, 오프라인일 때만 캐시 폴백.
 * GET + 같은 출처만 다룬다. Supabase 등 외부 호출은 건드리지 않는다.
 */

const CACHE = 'cogito-v1'

self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE)
  const cached = await cache.match(request)
  const refresh = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone())
      return response
    })
    .catch(() => null)
  return cached ?? (await refresh) ?? Response.error()
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE)
  const cached = await cache.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok) cache.put(request, response.clone())
  return response
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE)
  try {
    const response = await fetch(request)
    if (response.ok) cache.put(request, response.clone())
    return response
  } catch {
    const cached = await cache.match(request)
    return cached ?? Response.error()
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (url.pathname.includes('/seed-shards/')) {
    event.respondWith(staleWhileRevalidate(request))
  } else if (url.pathname.includes('/assets/')) {
    event.respondWith(cacheFirst(request))
  } else {
    event.respondWith(networkFirst(request))
  }
})
