// LCL CEO App service worker: keeps the app shell available offline.
// Raise CACHE_NAME with each release (and VERSION in js/core.js).
const CACHE_NAME = "lcl-ceo-1.2.0";
const SHELL = [
  "./", "index.html", "app.css", "config.js", "manifest.json",
  "js/core.js", "js/data.js", "js/home.js", "js/work.js", "js/toolbox.js", "js/inbox.js", "js/orders.js", "js/bookings.js", "js/quotes-store.js", "quotes.html",
  "assets/logo.png", "assets/icon-192.png", "assets/icon-512.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("lcl-ceo-") && k !== CACHE_NAME).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// App files: network first so updates arrive, cache when offline.
// The Hub and Google are never cached here; the app keeps its own data copy.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin || !url.pathname.includes("/ceo/")) return;
  e.respondWith(
    fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE_NAME).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match("index.html")))
  );
});
